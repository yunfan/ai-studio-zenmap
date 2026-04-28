export const onRequest = async ({ request, next, env }) => {
  const url = new URL(request.url);

  // API routes go to Functions
  if (url.pathname.startsWith('/api')) {
    return next();
  }

  // Static assets - let built-in static file handling serve them
  if (url.pathname.startsWith('/assets')) {
    return next();
  }

  // SPA fallback - serve index.html for all other routes (including /a/*)
  // env.ASSETS is the Cloudflare Pages static assets binding
  return env.ASSETS.fetch(new Request(`${url.origin}/index.html`, request));
};