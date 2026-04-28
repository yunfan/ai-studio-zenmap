import bcrypt from 'bcryptjs';
import type { Env } from '../../../types';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export const onRequestPost = async ({ params, request, env }: { params: { id: string }; request: Request; env: Env }) => {
  try {
    const { password } = await request.json();

    const result = await env.DB.prepare(
      'SELECT data, passwordHash FROM maps WHERE id = ?'
    ).bind(params.id).first();

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

    return new Response(JSON.stringify({ data: result.data, id: params.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
};