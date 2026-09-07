import { createDatabase, createHandler } from './handler.js';

const url = Deno.env.get('SUPABASE_URL');
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
if (!url || !serviceKey) throw new Error('Supabase runtime configuration is missing');

Deno.serve(createHandler({
  database: createDatabase(url, serviceKey),
  secret: serviceKey,
}));
