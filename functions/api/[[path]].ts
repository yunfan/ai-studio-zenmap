import { ulid } from 'ulid';
import bcrypt from 'bcryptjs';

interface Env {
  DB: D1Database;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

async function handleRequest(env: Env, request: Request): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const path = url.pathname.replace('/api', '') || '/';
  const method = request.method;

  try {
    if (path === '/maps' && method === 'POST') {
      return await handleSave(env, request);
    }
    if (path.match(/^\/maps\/[^/]+\/meta$/) && method === 'GET') {
      const id = path.split('/')[2];
      return await handleGetMeta(env, id);
    }
    if (path.match(/^\/maps\/[^/]+\/load$/) && method === 'POST') {
      const id = path.split('/')[2];
      return await handleLoad(env, request, id);
    }
    return new Response('Not Found', { status: 404, headers: corsHeaders });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

async function handleSave(env: Env, request: Request): Promise<Response> {
  const { data, parentId, password } = await request.json();
  const id = ulid();

  let passwordHash = null;
  if (password) {
    passwordHash = await bcrypt.hash(password, 10);
  }

  await env.DB.prepare(
    'INSERT INTO maps (id, parentId, data, passwordHash) VALUES (?, ?, ?, ?)'
  ).bind(id, parentId || null, data, passwordHash).run();

  return new Response(JSON.stringify({ id }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function handleGetMeta(env: Env, id: string): Promise<Response> {
  const result = await env.DB.prepare(
    'SELECT passwordHash FROM maps WHERE id = ?'
  ).bind(id).first();

  if (!result) {
    return new Response(JSON.stringify({ error: 'Map not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ requiresPassword: !!result.passwordHash }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function handleLoad(env: Env, request: Request, id: string): Promise<Response> {
  const { password } = await request.json();

  const result = await env.DB.prepare(
    'SELECT data, passwordHash FROM maps WHERE id = ?'
  ).bind(id).first();

  if (!result) {
    return new Response(JSON.stringify({ error: 'Map not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (result.passwordHash) {
    if (!password) {
      return new Response(JSON.stringify({ error: 'Password required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const isMatch = await bcrypt.compare(password, result.passwordHash);
    if (!isMatch) {
      return new Response(JSON.stringify({ error: 'Incorrect password' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  return new Response(JSON.stringify({ data: result.data, id }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return handleRequest(env, request);
  },
};