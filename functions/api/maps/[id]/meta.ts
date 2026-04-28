import type { Env } from '../../types';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export const onRequestGet = async ({ params, env }: { params: { id: string }; env: Env }) => {
  try {
    const result = await env.DB.prepare(
      'SELECT passwordHash FROM maps WHERE id = ?'
    ).bind(params.id).first();

    if (!result) {
      return new Response(JSON.stringify({ error: 'Map not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ requiresPassword: !!result.passwordHash }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
};