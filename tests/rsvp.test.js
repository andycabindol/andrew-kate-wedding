import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyRsvp, createDatabase, createHandler, invitationRecord, invitationsFromTable, normalizeName, publicInvitation } from '../supabase/functions/wedding-rsvp/handler.js';
import { highlightUnmatched, matchParties, partiesFromRows, suggestGuests } from '../supabase/functions/wedding-rsvp/matching.js';
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
test('public list hides replies, and a raw invitation id cannot overwrite one', async () => {
  const replied = applyRsvp(party, {
    responses: [{ id: 'alex', attending: true }, { id: 'jamie', attending: false }],
    wishes: 'See you there',
  });
  const handler = createHandler({
    secret: 'test-only-secret',
    database: {
      allowRequest: async () => true,
      list: async () => [replied],
      getParty: async (id) => id === party.id ? replied : null,
    },
  });
  const call = (body) => handler(new Request('https://example.test', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }));
  const listed = await (await call({ action: 'list' })).json();
  assert.equal(listed.parties[0].replied, true);
  assert.equal(listed.parties[0].wishes, undefined);
  assert.equal(listed.parties[0].members[0].attending, undefined);
  assert.deepEqual(publicInvitation(replied).members.map((member) => member.name), ['Alex Guest', 'Jamie Guest']);
  assert.equal((await call({ action: 'submit', token: `sheet:${party.id}`, responses: replied.members.map((member) => ({ id: member.id, attending: false })), wishes: '' })).status, 401);
  const opened = await (await call({ action: 'open', id: party.id })).json();
  assert.equal(opened.party.wishes, 'See you there');
  assert.ok(opened.token);
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
  assert.equal((await app.call({ ...valid(token), wishes: 'a'.repeat(130000) })).status, 413);
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
test('sheet rows keep same last names as separate invitations and add plus ones', () => {
  const parties = partiesFromRows([
    { party_id: 'cabindol-andrew', party_name: 'Andrew Cabindol', guest_name: 'Andrew Cabindol', also_known_as: 'Andy Cabindol', extra_guests: '1' },
    { party_id: 'cabindol-parents', party_name: 'Jose & Maria Cabindol', guest_name: 'Jose Cabindol', extra_guests: '0' },
    { party_id: 'cabindol-parents', party_name: 'Jose & Maria Cabindol', guest_name: 'Maria Cabindol', also_known_as: 'Mary Cabindol' },
  ]);
  assert.equal(parties.length, 2);
  assert.equal(parties[0].members.at(-1).plusOne, true);
  assert.equal(matchParties('Andy Cabindol', parties)[0].id, 'cabindol-andrew');
  assert.equal(matchParties('Andew Cabindol', parties)[0].id, 'cabindol-andrew');
  assert.deepEqual(matchParties('Cabindol', parties).map((party) => party.id), ['cabindol-andrew', 'cabindol-parents']);
  assert.equal(matchParties('Mary Cabindol', parties)[0].label, 'Jose & Maria Cabindol');
  assert.equal(matchParties('Ann Cabindol', parties).length, 0);
});
test('name suggestions highlight only the letters that do not match', () => {
  const parties = partiesFromRows([
    { party_id: 'cabindol-andrew', party_name: 'Andrew Cabindol', guest_name: 'Andrew Cabindol', also_known_as: 'Andy Cabindol, Andy', extra_guests: '1' },
    { party_id: 'cabindol-parents', party_name: 'Jose & Maria Cabindol', guest_name: 'Jose Cabindol', extra_guests: '0' },
    { party_id: 'cabindol-parents', party_name: 'Jose & Maria Cabindol', guest_name: 'Maria Cabindol', also_known_as: 'Mary Cabindol' },
  ]);
  assert.deepEqual(highlightUnmatched('Andrew Cabindol', 'Cab'), [
    { text: 'Andrew ', unmatched: true },
    { text: 'Cab', unmatched: false },
    { text: 'indol', unmatched: true },
  ]);
  assert.deepEqual(suggestGuests('Cab', parties).map((item) => item.name), [
    'Andrew Cabindol', 'Jose Cabindol', 'Maria Cabindol',
  ]);
  assert.deepEqual(suggestGuests('Andy', parties).map((item) => item.name), ['Andy Cabindol']);
  const lexi = [{ id: 'cabindol', label: 'Cabindol Family', members: [{ id: 'lexi', name: 'Lexi Cabindol' }] }];
  assert.deepEqual(suggestGuests('Lexi', lexi).map((item) => item.name), ['Lexi Cabindol']);
  assert.deepEqual(suggestGuests('Alexandra', lexi), []);
  assert.deepEqual(suggestGuests('Alex', lexi), []);
  const mixed = partiesFromRows([
    { party_id: 'replied', party_name: 'Alex Replied', guest_name: 'Alex Replied', rsvp_received: 'TRUE', attending: 'Yes' },
    { party_id: 'open', party_name: 'Alex Open', guest_name: 'Alex Open' },
  ]);
  assert.deepEqual(suggestGuests('Alex', mixed).map((item) => item.name), ['Alex Open', 'Alex Replied']);
  assert.equal(suggestGuests('P', parties).some((item) => /plus one/i.test(item.name)), false);
  const twoPlusOnes = partiesFromRows([
    { party_id: 'bennett-ava', party_name: 'Ava Bennett', guest_name: 'Ava Bennett', extra_guests: '2' },
  ]);
  assert.deepEqual(suggestGuests('P', twoPlusOnes), []);
});
test('a saved sheet reply is shown with who is attending', () => {
  const parties = partiesFromRows([
    { party_id: 'cabindol-andrew', party_name: 'Andrew Cabindol', guest_name: 'Andrew Cabindol', also_known_as: 'Andy Cabindol', extra_guests: '1', rsvp_received: 'TRUE', attending: 'Yes', reply_name: 'Jordan Lee: Attending' },
  ]);
  const match = matchParties('Andy Cabindol', parties)[0];
  assert.equal(match.replied, true);
  assert.equal(match.members[0].name, 'Andrew Cabindol');
  assert.equal(match.members[0].attending, true);
  assert.equal(match.members[1].name, 'Jordan Lee');
  assert.equal(match.members[1].plusOne, true);
  assert.equal(match.members[1].attending, true);
});
test('a saved reply is attached the next time that invitation is loaded', async () => {
  const invitations = [{
    id: 'p1',
    label: 'Alex',
    members: [{ id: 'alex', name: 'Alex Guest' }, { id: 'plus', name: 'Plus one', plusOne: true }],
    search_names: ['alex guest'],
  }];
  const replies = [];
  const fetcher = async (url, options = {}) => {
    const path = url.split('/rest/v1/')[1];
    if (path.startsWith('wedding_invitations')) return { ok: true, text: async () => JSON.stringify(invitations) };
    if (path.startsWith('wedding_rsvps') && options.method === 'POST') {
      replies.splice(0, replies.length, JSON.parse(options.body));
      return { ok: true, text: async () => '' };
    }
    if (path.startsWith('wedding_rsvps')) return { ok: true, text: async () => JSON.stringify(replies) };
    throw new Error(path);
  };
  const database = createDatabase('https://db.test', 'key', fetcher);
  const before = await database.getParty('p1');
  assert.equal(before.replied, false);
  await database.save({
    invitation_id: 'p1',
    responses: [{ id: 'alex', attending: true }, { id: 'plus', attending: true, name: 'Jordan Lee' }],
    wishes: 'See you there',
    updated_at: '2026-09-08T00:00:00.000Z',
  });
  const after = await database.list();
  assert.equal(after[0].replied, true);
  assert.equal(after[0].wishes, 'See you there');
  assert.equal(after[0].members[0].attending, true);
  assert.equal(after[0].members[1].name, 'Jordan Lee');
  assert.equal(after[0].members[1].attending, true);
  assert.deepEqual(applyRsvp(invitations[0], null).replied, false);
});
test('admin can sign in, save an invitation, and remove it', async () => {
  const invitations = new Map();
  const handler = createHandler({
    secret: 'test-only-secret',
    adminPassword: 'desk-key',
    database: {
      allowRequest: async () => true,
      list: async () => [...invitations.values()],
      saveInvitation: async (party) => invitations.set(party.id, { ...party, replied: false, wishes: '' }),
      deleteInvitation: async (id) => invitations.delete(id),
    },
  });
  const call = (body) => handler(new Request('https://example.test', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }));
  assert.equal((await call({ action: 'admin-login', password: 'nope' })).status, 401);
  const token = (await (await call({ action: 'admin-login', password: 'desk-key' })).json()).token;
  const saved = await (await call({
    action: 'admin-save', token, party: { label: 'Maria & Angelica Torres', members: [{ name: 'Maria Torres' }, { name: 'Angelica Torres' }] },
  })).json();
  assert.equal(saved.saved, true);
  assert.equal(saved.party.members.length, 2);
  assert.equal((await (await call({ action: 'admin-list', token })).json()).parties.length, 1);
  assert.equal((await call({ action: 'admin-delete', token, id: saved.party.id })).status, 200);
  assert.equal(invitations.size, 0);
  assert.equal(invitationRecord({ label: 'Sam Feldmann', members: [{ name: 'Sam Feldmann' }] }).id, 'sam-feldmann');
});
test('guest table upload edits a matching row and adds a new guest', () => {
  const existing = [{
    id: 'songfo',
    label: 'Bernard, Geryl & Eli',
    members: [{ id: 'bernard-songfo', name: 'Bernard Songfo' }, { id: 'geryl-tan', name: 'Geryl Tan' }],
  }];
  const imported = invitationsFromTable([
    { group_id: 'songfo', group_name: 'Songfo Family', guest_id: 'bernard-songfo', guest_name: 'Bernard Songfo', nicknames: '', plus_one: '', attending: 'yes', wishes: 'See you there' },
    { group_id: 'songfo', group_name: 'Songfo Family', guest_id: '', guest_name: 'Eli Songfo', nicknames: '', plus_one: '', attending: '', wishes: '' },
    { group_id: '', group_name: 'New Couple', guest_id: '', guest_name: 'Pat Example', nicknames: 'Patty', plus_one: '', attending: '', wishes: '' },
  ], existing);
  const songfo = imported.find((item) => item.party.id === 'songfo');
  assert.equal(songfo.party.label, 'Songfo Family');
  assert.deepEqual(songfo.party.members.map((member) => member.name), ['Bernard Songfo', 'Geryl Tan', 'Eli Songfo']);
  assert.equal(songfo.responses.find((response) => response.id === 'bernard-songfo').attending, true);
  assert.equal(imported.some((item) => item.party.label === 'New Couple' && item.party.members[0].name === 'Pat Example'), true);
});
test('guest import validates unique party and member IDs and normalizes search names', () => {
  const rows = prepareInvitations({ parties: [party] });
  assert.deepEqual(rows[0].search_names, ['alex guest', 'jamie guest']);
  assert.throws(() => prepareInvitations({ parties: [party, party] }));
  assert.throws(() => prepareInvitations({ parties: [{ ...party, members: [party.members[0], party.members[0]] }] }));
  assert.throws(() => prepareInvitations({ parties: [] }));
});
