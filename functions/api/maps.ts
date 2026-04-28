import { ulid } from 'ulid';
import bcrypt from 'bcryptjs';
import type { Env } from './types';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export const onRequestPost = async ({ request, env }: { request: Request; env: Env }) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
};