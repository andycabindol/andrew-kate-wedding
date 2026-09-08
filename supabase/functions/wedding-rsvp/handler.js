import { matchParties, normalizeName, searchNamesFor } from './matching.js';

function slugPart(value) {
  return normalizeName(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}

function isYes(value) {
  return /^(y|yes|true|1)$/i.test(String(value || '').trim());
}

function attendingFromCell(value) {
  const text = String(value || '').trim().toLowerCase();
  if (['yes', 'y', 'attending', 'true', '1'].includes(text)) return true;
  if (['no', 'n', 'unable', 'unable to attend', 'false', '0'].includes(text)) return false;
  return null;
}

export function invitationsFromTable(rows, existing = []) {
  if (!Array.isArray(rows) || !rows.length) throw new Error('The table is empty.');
  const groups = [];
  const byKey = new Map();
  for (const row of rows) {
    const groupId = String(row.group_id || '').trim();
    const groupName = String(row.group_name || '').trim();
    const guestId = String(row.guest_id || '').trim();
    const guestName = String(row.guest_name || '').trim();
    const plusOne = isYes(row.plus_one);
    if (!groupId && !groupName && !guestId && !guestName && !plusOne) continue;
    if (!groupId && !groupName) throw new Error('Each row needs a group name.');
    const current = existing.find((party) => party.id === groupId)
      || (!groupId ? existing.find((party) => normalizeName(party.label) === normalizeName(groupName)) : null);
    const key = current?.id || groupId || `name:${normalizeName(groupName)}`;
    if (!byKey.has(key)) {
      byKey.set(key, {
        id: current?.id || groupId,
        label: groupName || current?.label || '',
        members: (current?.members || []).map((member) => ({
          id: member.id,
          name: member.name,
          ...(member.aliases?.length ? { aliases: [...member.aliases] } : {}),
          ...(member.plusOne ? { plusOne: true } : {}),
        })),
        wishes: typeof row.wishes === 'string' && row.wishes.trim() ? row.wishes.trim() : null,
      });
      groups.push(byKey.get(key));
    }
    const group = byKey.get(key);
    if (groupName) group.label = groupName;
    if (typeof row.wishes === 'string' && row.wishes.trim()) group.wishes = row.wishes.trim();
    if (!guestId && !guestName && !plusOne) continue;
    let member = guestId ? group.members.find((item) => item.id === guestId) : null;
    if (!member && guestName) {
      member = group.members.find((item) => normalizeName(item.name) === normalizeName(guestName) && Boolean(item.plusOne) === plusOne);
    }
    if (!member) {
      member = { id: guestId, name: guestName, ...(plusOne ? { plusOne: true } : {}) };
      group.members.push(member);
    } else {
      if (guestName) member.name = guestName;
      if (String(row.plus_one || '').trim()) {
        if (plusOne) member.plusOne = true;
        else delete member.plusOne;
      }
    }
    if ('nicknames' in row) {
      const aliases = String(row.nicknames || '').split(',').map((alias) => alias.trim()).filter(Boolean);
      if (aliases.length) member.aliases = aliases;
      else delete member.aliases;
    }
    const attending = attendingFromCell(row.attending);
    if (attending !== null) member.tableAttending = attending;
  }
  return groups.map((group) => {
    const flags = group.members.map((member) => member.tableAttending);
    const party = invitationRecord(group);
    const responses = party.members.flatMap((member, index) => (
      flags[index] === true || flags[index] === false
        ? [{ id: member.id, name: member.name, attending: flags[index], plusOne: Boolean(member.plusOne) }]
        : []
    ));
    return { party, wishes: group.wishes, responses };
  });
}

export function invitationRecord(input) {
  const label = typeof input?.label === 'string' ? input.label.trim() : '';
  if (label.length < 2 || label.length > 200) throw new Error('Add an invitation name.');
  const incoming = Array.isArray(input.members) ? input.members : [];
  if (!incoming.length || incoming.length > 30) throw new Error('Add between 1 and 30 guests.');
  const used = new Set();
  const members = incoming.map((member, index) => {
    const plusOne = Boolean(member?.plusOne);
    const name = typeof member?.name === 'string' ? member.name.trim() : '';
    if (!plusOne && (name.length < 2 || name.length > 120)) throw new Error('Each guest needs a name.');
    if (plusOne && name && (name.length < 2 || name.length > 120)) throw new Error('A plus-one name is too long.');
    let id = typeof member?.id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(member.id) ? member.id : '';
    if (!id || used.has(id)) {
      const base = plusOne ? `plus-one-${index + 1}` : (slugPart(name) || `guest-${index + 1}`);
      id = base;
      let n = 2;
      while (used.has(id)) id = `${base}-${n++}`;
    }
    used.add(id);
    const aliases = [...new Set((Array.isArray(member?.aliases) ? member.aliases : [])
      .map((alias) => String(alias || '').trim())
      .filter((alias) => alias.length >= 2 && alias.length <= 120))].slice(0, 8);
    return {
      id,
      name: plusOne && !name ? 'Plus one' : name,
      ...(aliases.length ? { aliases } : {}),
      ...(plusOne ? { plusOne: true } : {}),
    };
  });
  const id = typeof input.id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(input.id) ? input.id : slugPart(label);
  if (!id) throw new Error('Add an invitation name.');
  return { id, label, members, search_names: searchNamesFor(members) };
}

function sameSecret(left, right) {
  const a = encoder.encode(String(left ?? ''));
  const b = encoder.encode(String(right ?? ''));
  if (!a.length || a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) mismatch |= a[i] ^ b[i];
  return mismatch === 0;
}

export function publicInvitation(party) {
  return {
    id: party.id,
    label: party.label,
    replied: Boolean(party.replied),
    members: (party.members || []).map((member) => ({
      id: member.id,
      name: member.name,
      ...(member.aliases?.length ? { aliases: [...member.aliases] } : {}),
      ...(member.plusOne ? { plusOne: true } : {}),
    })),
  };
}

export function applyRsvp(party, reply) {
  if (!reply) return { ...party, replied: false, wishes: party.wishes || '' };
  const responses = Array.isArray(reply.responses) ? reply.responses : [];
  return {
    ...party,
    replied: true,
    wishes: typeof reply.wishes === 'string' ? reply.wishes : '',
    updatedAt: reply.updated_at || '',
    members: (party.members || []).map((member) => {
      const answer = responses.find((item) => item?.id === member.id);
      if (!answer || typeof answer.attending !== 'boolean') return member;
      const named = typeof answer.name === 'string' ? answer.name.trim() : '';
      return {
        ...member,
        attending: answer.attending,
        ...(member.plusOne && named ? { name: named } : {}),
      };
    }),
  };
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
};

const encoder = new TextEncoder();
export { normalizeName };
const toBase64 = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromBase64 = (value) => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const reply = (data, status = 200) => Response.json(data, { status, headers: cors });

export function createHandler({ database, secret, now = Date.now, adminPassword = '' }) {
  const key = crypto.subtle.importKey('raw', encoder.encode(`wedding-rsvp:${secret}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
  async function signature(value) {
    return toBase64(new Uint8Array(await crypto.subtle.sign('HMAC', await key, encoder.encode(value))));
  }
  async function adminToken() {
    const payload = toBase64(encoder.encode(JSON.stringify({ role: 'admin', expires: now() + 12 * 60 * 60 * 1000 })));
    return `${payload}.${await signature(payload)}`;
  }
  async function tokenFor(party) {
    const payload = toBase64(encoder.encode(JSON.stringify({
      id: party.id, members: party.members.map((member) => member.id), expires: now() + 30 * 60 * 1000,
    })));
    return `${payload}.${await signature(payload)}`;
  }
  async function verify(token) {
    if (typeof token !== 'string' || token.length > 10000) return null;
    try {
      const parts = token.split('.');
      if (parts.length !== 2) return null;
      const valid = await crypto.subtle.verify('HMAC', await key, fromBase64(parts[1]), encoder.encode(parts[0]));
      if (!valid) return null;
      const payload = JSON.parse(new TextDecoder().decode(fromBase64(parts[0])));
      return typeof payload.expires === 'number' && payload.expires > now() ? payload : null;
    } catch { return null; }
  }
  return async (request) => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return reply({ error: 'Method not allowed.' }, 405);
    try {
      if (!request.headers.get('content-type')?.includes('application/json')) return reply({ error: 'Please send a valid reply.' }, 415);
      // Bound the streamed body before decoding it, including requests without Content-Length.
      const reader = request.body?.getReader();
      let bytes = 0;
      const chunks = [];
      if (!reader) return reply({ error: 'Please send a valid reply.' }, 400);
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.length;
        if (bytes > 120000) { await reader.cancel(); return reply({ error: 'Your reply is too long.' }, 413); }
        chunks.push(value);
      }
      const buffer = new Uint8Array(bytes);
      let offset = 0;
      for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }
      let body;
      try { body = JSON.parse(new TextDecoder().decode(buffer)); }
      catch { return reply({ error: 'Please send a valid reply.' }, 400); }
      if (!body || !['status', 'list', 'open', 'search', 'submit', 'admin-login', 'admin-list', 'admin-save', 'admin-delete', 'admin-clear', 'admin-attendance', 'admin-import'].includes(body.action)) return reply({ error: 'Unknown request.' }, 400);
      if (body.action === 'status') return reply({ open: await database.isOpen() });
      if (body.action === 'list') {
        const parties = await database.list();
        return reply({ open: parties.length > 0, parties: parties.map(publicInvitation) });
      }

      if (body.action === 'admin-login' || body.action.startsWith('admin-')) {
        if (body.action === 'admin-list') {
          const session = await verify(body.token);
          if (!session || session.role !== 'admin') return reply({ error: 'Please sign in again.' }, 401);
          return reply({ parties: await database.list() });
        }
        const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
        const rateKey = await signature(`rate:admin:${ip}`);
        if (!await database.allowRequest(rateKey)) return reply({ error: 'Too many attempts. Please try again in 10 minutes.' }, 429);
        if (body.action === 'admin-login') {
          if (!adminPassword || typeof body.password !== 'string' || body.password.length > 200 || !sameSecret(body.password, adminPassword)) {
            return reply({ error: 'That password isn’t right.' }, 401);
          }
          return reply({ token: await adminToken() });
        }
        const session = await verify(body.token);
        if (!session || session.role !== 'admin') return reply({ error: 'Please sign in again.' }, 401);
        if (body.action === 'admin-attendance') {
          const id = typeof body.id === 'string' ? body.id.trim() : '';
          const memberId = typeof body.memberId === 'string' ? body.memberId.trim() : '';
          const attending = body.attending === true || body.attending === false ? body.attending : null;
          const party = await database.getParty(id);
          const member = party?.members.find((item) => item.id === memberId);
          if (!party || !member) return reply({ error: 'Choose a guest to update.' }, 400);
          const existing = await database.getReply(id);
          const kept = (Array.isArray(existing?.responses) ? existing.responses : [])
            .filter((item) => item?.id && item.id !== memberId && party.members.some((person) => item.id === person.id));
          if (attending !== null) {
            const previous = (existing?.responses || []).find((item) => item?.id === memberId);
            const named = typeof previous?.name === 'string' && previous.name.trim() && !/^plus one/i.test(previous.name)
              ? previous.name.trim()
              : member.name;
            kept.push({ id: member.id, name: named, attending, plusOne: Boolean(member.plusOne) });
          }
          const wishes = typeof existing?.wishes === 'string' ? existing.wishes : '';
          if (!kept.length && !wishes) await database.deleteReply(id);
          else await database.save({
            invitation_id: id,
            responses: kept,
            wishes,
            updated_at: new Date(now()).toISOString(),
          });
          return reply({ saved: true });
        }
        if (body.action === 'admin-clear') {
          const id = typeof body.id === 'string' ? body.id.trim() : '';
          if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) return reply({ error: 'Choose an invitation to clear.' }, 400);
          await database.deleteReply(id);
          return reply({ cleared: true });
        }
        if (body.action === 'admin-import') {
          if (!Array.isArray(body.rows) || body.rows.length > 500) return reply({ error: 'Upload a table with your guest rows.' }, 400);
          const existing = await database.list();
          let imported;
          try { imported = invitationsFromTable(body.rows, existing); }
          catch (error) { return reply({ error: error.message || 'Check the table and try again.' }, 400); }
          for (const item of imported) {
            await database.saveInvitation(item.party);
            const existingReply = await database.getReply(item.party.id);
            const wishes = item.wishes == null ? (existingReply?.wishes || '') : item.wishes;
            const prior = new Map((existingReply?.responses || []).map((response) => [response.id, response]));
            for (const response of item.responses) prior.set(response.id, response);
            const responses = [...prior.values()].filter((response) => item.party.members.some((member) => member.id === response.id));
            if (!responses.length && !wishes) await database.deleteReply(item.party.id);
            else await database.save({
              invitation_id: item.party.id,
              responses,
              wishes,
              updated_at: new Date(now()).toISOString(),
            });
          }
          return reply({ imported: imported.length });
        }
        if (body.action === 'admin-delete') {
          const id = typeof body.id === 'string' ? body.id.trim() : '';
          if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) return reply({ error: 'Choose an invitation to remove.' }, 400);
          await database.deleteInvitation(id);
          return reply({ deleted: true });
        }
        let party;
        try { party = invitationRecord(body.party); }
        catch (error) { return reply({ error: error.message || 'Check the invitation and try again.' }, 400); }
        await database.saveInvitation(party);
        return reply({ saved: true, party });
      }

      const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
      const rateKey = await signature(`rate:${ip}`);
      if (!await database.allowRequest(rateKey)) return reply({ error: 'Too many attempts. Please try again in 10 minutes.' }, 429);
      if (body.action === 'open') {
        const id = typeof body.id === 'string' ? body.id.trim() : '';
        if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) return reply({ error: 'Find your invitation again.' }, 400);
        const party = await database.getParty(id);
        if (!party) return reply({ error: 'Find your invitation again.' }, 404);
        return reply({ party, token: await tokenFor(party) });
      }
      if (body.action === 'search') {
        if (typeof body.name !== 'string' || body.name.trim().length < 3 || body.name.length > 120) {
          return reply({ error: 'Please enter your full name as it appears on the invitation.' }, 400);
        }
        if (!await database.isOpen()) return reply({ open: false, parties: [] });
        const parties = await database.search(normalizeName(body.name));
        return reply({ open: true, parties: await Promise.all(parties.map(async (party) => ({
          ...publicInvitation(party), token: await tokenFor(party),
        }))) });
      }

      const session = await verify(body.token);
      if (!session) return reply({ error: 'Please find your invitation again before replying.' }, 401);
      const party = await database.getParty(session.id);
      if (!party || JSON.stringify(session.members) !== JSON.stringify(party.members.map((member) => member.id))) {
        return reply({ error: 'Your invitation has changed. Please find it again.' }, 401);
      }
      const responses = body.responses;
      if (!Array.isArray(responses) || responses.length !== party.members.length
        || new Set(responses.map((r) => r?.id)).size !== party.members.length
        || responses.some((r) => !r || typeof r.attending !== 'boolean' || !party.members.some((m) => m.id === r.id))) {
        return reply({ error: 'Please choose attending or unable to attend for every invited guest.' }, 400);
      }
      if (typeof body.wishes !== 'string' || body.wishes.length > 2000) return reply({ error: 'Please keep your note to 2,000 characters or fewer.' }, 400);
      const savedResponses = [];
      for (const member of party.members) {
        const answer = responses.find((r) => r.id === member.id);
        const named = typeof answer.name === 'string' ? answer.name.trim() : '';
        if (member.plusOne && answer.attending && (named.length < 2 || named.length > 80)) {
          return reply({ error: 'Please add your guest’s name, or mark that plus one as unable to attend.' }, 400);
        }
        savedResponses.push({ id: member.id, name: member.plusOne && named ? named : member.name, attending: answer.attending, plusOne: Boolean(member.plusOne) });
      }
      await database.save({
        invitation_id: party.id, responses: savedResponses,
        wishes: body.wishes.trim(), updated_at: new Date(now()).toISOString(),
      });
      return reply({ saved: true });
    } catch {
      return reply({ error: 'We couldn’t save or load your reply right now. Please try again in a moment.' }, 503);
    }
  };
}

export function createDatabase(url, serviceKey, fetcher = fetch) {
  async function rest(path, options = {}) {
    const response = await fetcher(`${url}/rest/v1/${path}`, {
      ...options,
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json', ...options.headers },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error('Database request failed');
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }
  async function parties() {
    const invitations = await rest('wedding_invitations?select=id,label,members,search_names&order=label.asc&limit=1000') || [];
    const replies = await rest('wedding_rsvps?select=invitation_id,responses,wishes,updated_at&limit=1000') || [];
    const byId = new Map(replies.map((row) => [row.invitation_id, row]));
    return invitations.map((party) => applyRsvp(party, byId.get(party.id)));
  }
  return {
    async isOpen() { return (await parties()).length > 0; },
    allowRequest(p_key) { return rest('rpc/wedding_check_rate_limit', { method: 'POST', body: JSON.stringify({ p_key }) }); },
    list: parties,
    async search(name) { return matchParties(name, await parties()); },
    async getParty(id) { return (await parties()).find((party) => party.id === id) || null; },
    async getReply(id) {
      const rows = await rest(`wedding_rsvps?invitation_id=eq.${encodeURIComponent(id)}&select=responses,wishes`) || [];
      return rows[0] || null;
    },
    async deleteReply(id) {
      await rest(`wedding_rsvps?invitation_id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
    },
    async save(data) {
      await rest('wedding_rsvps?on_conflict=invitation_id', {
        method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(data),
      });
    },
    async saveInvitation(party) {
      await rest('wedding_invitations?on_conflict=id', {
        method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ id: party.id, label: party.label, members: party.members, search_names: party.search_names }),
      });
    },
    async deleteInvitation(id) {
      await rest(`wedding_rsvps?invitation_id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
      await rest(`wedding_invitations?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
    },
  };
}
