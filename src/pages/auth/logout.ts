import type { APIRoute } from 'astro';

export const GET: APIRoute = ({ session, redirect }) => {
  session?.destroy();
  return redirect('/');
};
