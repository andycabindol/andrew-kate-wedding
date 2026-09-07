import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHandler, normalizeName } from '../supabase/functions/wedding-rsvp/handler.js';
import { prepareInvitations } from '../scripts/import-guests.js';

const party = { id: 'test-party', label: 'Alex & Jamie', members: [{ id: 'alex', name: 'Alex Guest' }, { id: 'jamie', name: 'Jamie Guest' }] };
function setup() {
  const rows = new Map();
  let clock = 1000000;
  let failSave = false;
  let open = true;
  let allowed = true;
  const handler = createHandler({ secret: 'test-only-secret', now: () => clock, database: {
    isOpen: async () => open,
    allowRequest: async () => allowed,
    search: async (name) => name === 'alex guest' ? [party] : [],
    getParty: async (id) => id === party.id ? party : null,
    save: async (data) => { if (failSave) throw new Error('offline'); rows.set(data.invitation_id, data); },
  } });
  const call = (body) => handler(new Request('https://example.test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
  const search = async () => (await (await call({ action: 'search', name: 'Alex Guest' })).json()).parties[0].token;
  return { call, search, rows, expire: () => { clock += 31 * 60000; }, fail: () => { failSave = true; }, close: () => { open = false; }, limit: () => { allowed = false; } };
}
const valid = (token) => ({ action: 'submit', token, responses: [{ id: 'alex', attending: true }, { id: 'jamie', attending: false }], wishes: 'Congratulations!' });

test('name normalization supports accents, curly apostrophes and whitespace', () => {
  assert.equal(normalizeName('  José   O’Brien  '), "jose o'brien");
});
test('empty guest list reports opening soon', async () => {
  const app = setup(); app.close();
  assert.deepEqual(await (await app.call({ action: 'status' })).json(), { open: false });
  assert.deepEqual(await (await app.call({ action: 'search', name: 'Alex Guest' })).json(), { open: false, parties: [] });
});
test('search requires a full matching name, returns no existing replies', async () => {
  const app = setup();
  assert.deepEqual((await (await app.call({ action: 'search', name: 'Alex' })).json()).parties, []);
  const response = await (await app.call({ action: 'search', name: 'Alex Guest' })).json();
  assert.ok(response.parties[0].token);
  assert.equal(response.parties[0].wishes, undefined);
});
test('saves per-person responses and wishes; repeat submission updates a single party', async () => {
  const app = setup(); const token = await app.search();
  assert.deepEqual(await (await app.call(valid(token))).json(), { saved: true });
  assert.equal(app.rows.get(party.id).wishes, 'Congratulations!');
  assert.equal(app.rows.get(party.id).responses[1].attending, false);
  const changed = valid(token); changed.responses[1].attending = true;
  await app.call(changed);
  assert.equal(app.rows.size, 1);
  assert.equal(app.rows.get(party.id).responses[1].attending, true);
});
test('rejects a forged, missing or expired invitation token', async () => {
  const app = setup(); const token = await app.search();
  assert.equal((await app.call(valid(token + 'tampered'))).status, 401);
  assert.equal((await app.call(valid(''))).status, 401);
  app.expire();
  assert.equal((await app.call(valid(token))).status, 401);
  assert.equal(app.rows.size, 0);
});
test('rejects missing, duplicated, uninvited guests and non-boolean attendance', async () => {
  const app = setup(); const token = await app.search();
  for (const responses of [
    [{ id: 'alex', attending: true }],
    [{ id: 'alex', attending: true }, { id: 'alex', attending: false }],
    [{ id: 'alex', attending: true }, { id: 'unknown', attending: true }],
    [{ id: 'alex', attending: 'yes' }, { id: 'jamie', attending: false }],
    [null, null],
  ]) assert.equal((await app.call({ ...valid(token), responses })).status, 400);
  assert.equal(app.rows.size, 0);
});
test('oversized wishes and payload are rejected', async () => {
  const app = setup(); const token = await app.search();
  assert.equal((await app.call({ ...valid(token), wishes: 'a'.repeat(2001) })).status, 400);
  assert.equal((await app.call({ ...valid(token), wishes: 'a'.repeat(21000) })).status, 413);
});
test('database failure never claims a saved RSVP', async () => {
  const app = setup(); const token = await app.search(); app.fail();
  const response = await app.call(valid(token));
  assert.equal(response.status, 503);
  assert.equal((await response.json()).saved, undefined);
});
test('rate limits name lookup and reply attempts', async () => {
  const app = setup(); app.limit();
  assert.equal((await app.call({ action: 'search', name: 'Alex Guest' })).status, 429);
});
test('guest import validates unique party and member IDs and normalizes search names', () => {
  const rows = prepareInvitations({ parties: [party] });
  assert.deepEqual(rows[0].search_names, ['alex guest', 'jamie guest']);
  assert.throws(() => prepareInvitations({ parties: [party, party] }));
  assert.throws(() => prepareInvitations({ parties: [{ ...party, members: [party.members[0], party.members[0]] }] }));
  assert.throws(() => prepareInvitations({ parties: [] }));
});
