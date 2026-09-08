import { createDatabase, createHandler } from './handler.js';
import { createSheet, GUEST_SHEET_CSV_URL } from './sheet.js';

const url = Deno.env.get('SUPABASE_URL');
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
if (!url || !serviceKey) throw new Error('Supabase runtime configuration is missing');

const sheet = createSheet({
  url: Deno.env.get('RSVP_SHEET_URL'),
  secret: Deno.env.get('RSVP_SHEET_SECRET'),
  csvUrl: Deno.env.get('RSVP_SHEET_CSV_URL') || GUEST_SHEET_CSV_URL,
});

Deno.serve(createHandler({
  database: createDatabase(url, serviceKey, fetch, sheet),
  secret: serviceKey,
}));
