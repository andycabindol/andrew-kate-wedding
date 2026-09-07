const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
};
const encoder = new TextEncoder();
export const normalizeName = (value) => value.normalize('NFKD').replace(/\p{M}/gu, '')
  .toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
const toBase64 = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromBase64 = (value) => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const reply = (data, status = 200) => Response.json(data, { status, headers: cors });

export function createHandler({ database, secret, now = Date.now }) {
  const key = crypto.subtle.importKey('raw', encoder.encode(`wedding-rsvp:${secret}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
  async function signature(value) {
    return toBase64(new Uint8Array(await crypto.subtle.sign('HMAC', await key, encoder.encode(value))));
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
        if (bytes > 20000) { await reader.cancel(); return reply({ error: 'Your reply is too long.' }, 413); }
        chunks.push(value);
      }
      const buffer = new Uint8Array(bytes);
      let offset = 0;
      for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }
      let body;
      try { body = JSON.parse(new TextDecoder().decode(buffer)); }
      catch { return reply({ error: 'Please send a valid reply.' }, 400); }
      if (!body || !['status', 'search', 'submit'].includes(body.action)) return reply({ error: 'Unknown request.' }, 400);
      if (body.action === 'status') return reply({ open: await database.isOpen() });

      const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
      const rateKey = await signature(`rate:${ip}`);
      if (!await database.allowRequest(rateKey)) return reply({ error: 'Too many attempts. Please try again in 10 minutes.' }, 429);
      if (body.action === 'search') {
        if (typeof body.name !== 'string' || body.name.trim().length < 3 || body.name.length > 120) {
          return reply({ error: 'Please enter your full name as it appears on the invitation.' }, 400);
        }
        if (!await database.isOpen()) return reply({ open: false, parties: [] });
        const parties = await database.search(normalizeName(body.name));
        return reply({ open: true, parties: await Promise.all(parties.map(async (party) => ({
          id: party.id, label: party.label, members: party.members, token: await tokenFor(party),
        }))) });
      }

      // The signed, short-lived lookup token authorizes only this invitation's reply.
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
      await database.save({
        invitation_id: party.id,
        responses: party.members.map((member) => ({ id: member.id, name: member.name, attending: responses.find((r) => r.id === member.id).attending })),
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
  return {
    async isOpen() { return (await rest('wedding_invitations?select=id&limit=1')).length > 0; },
    allowRequest(p_key) { return rest('rpc/wedding_check_rate_limit', { method: 'POST', body: JSON.stringify({ p_key }) }); },
    search(name) {
      const params = new URLSearchParams({ select: 'id,label,members', search_names: `cs.{${JSON.stringify(name)}}`, limit: '5', order: 'label.asc' });
      return rest(`wedding_invitations?${params}`);
    },
    async getParty(id) {
      const params = new URLSearchParams({ select: 'id,label,members', id: `eq.${id}`, limit: '1' });
      return (await rest(`wedding_invitations?${params}`))[0] || null;
    },
    save(data) {
      return rest('wedding_rsvps?on_conflict=invitation_id', {
        method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(data),
      });
    },
  };
}
