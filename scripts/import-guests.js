import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { normalizeName } from '../supabase/functions/wedding-rsvp/handler.js';

export function prepareInvitations(data) {
  if (!data || !Array.isArray(data.parties) || !data.parties.length) throw new Error('Provide a nonempty parties array.');
  const ids = new Set();
  return data.parties.map((party) => {
    if (typeof party.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(party.id) || ids.has(party.id)) {
      throw new Error('Each invitation needs a unique, stable id (letters, numbers, hyphens or underscores).');
    }
    ids.add(party.id);
    if (typeof party.label !== 'string' || !party.label.trim() || party.label.length > 200) throw new Error(`Invalid label for ${party.id}.`);
    if (!Array.isArray(party.members) || !party.members.length || party.members.length > 30) throw new Error(`Invalid guest count for ${party.id}.`);
    const memberIds = new Set();
    const members = party.members.map((member) => {
      if (typeof member.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(member.id) || memberIds.has(member.id)) {
        throw new Error(`Guest IDs must be unique within ${party.id}.`);
      }
      memberIds.add(member.id);
      if (typeof member.name !== 'string' || member.name.trim().length < 3 || member.name.length > 120) throw new Error(`Invalid guest name in ${party.id}.`);
      return { id: member.id, name: member.name.trim() };
    });
    return { id: party.id, label: party.label.trim(), members, search_names: [...new Set(members.map((member) => normalizeName(member.name)))] };
  });
}

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('Usage: npm run guests:import -- /path/to/guests.json [--check]');
  const parties = prepareInvitations(JSON.parse(await readFile(file, 'utf8')));
  const count = parties.reduce((total, party) => total + party.members.length, 0);
  if (process.argv.includes('--check')) {
    console.log(`Validated ${parties.length} invitations and ${count} guests. No data was uploaded.`);
    return;
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your shell (never a VITE_ variable).');
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith('.supabase.co')) throw new Error('Use your project’s HTTPS Supabase URL.');
  const response = await fetch(`${parsed.origin}/rest/v1/wedding_invitations?on_conflict=id`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(parties), signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Import failed (${response.status}). Check your credentials and database migration. No partial import is committed.`);
  console.log(`Imported ${parties.length} invitations and ${count} guests. RSVP lookup is now open.`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
