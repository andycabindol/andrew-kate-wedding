export const normalizeName = (value) => value.normalize('NFKD').replace(/\p{M}/gu, '')
  .toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();

const NICKNAMES = {
  andrew: ['andy', 'drew'], alexander: ['alex', 'xander'], alexandra: ['alex', 'lexi'],
  katherine: ['katie', 'kate', 'kathy', 'kat'], kathryn: ['katie', 'kate', 'kathy'],
  catherine: ['cathy', 'kate', 'katie'], elizabeth: ['liz', 'beth', 'eliza', 'lizzy', 'ellie'],
  robert: ['bob', 'rob', 'bobby'], william: ['will', 'bill', 'billy', 'liam'],
  james: ['jim', 'jimmy'], michael: ['mike'], jennifer: ['jen', 'jenny'],
  christopher: ['chris'], nicholas: ['nick', 'nicky'], joseph: ['joe', 'joey'],
  thomas: ['tom', 'tommy'], richard: ['rick', 'rich'], daniel: ['dan', 'danny'],
  matthew: ['matt'], anthony: ['tony'], benjamin: ['ben', 'benny'], samuel: ['sam'],
  jonathan: ['jon', 'john'], patricia: ['pat', 'patty'], margaret: ['maggie', 'meg', 'peggy'],
  rebecca: ['becca', 'becky'], stephanie: ['steph'], victoria: ['vicky', 'tori'],
  abigail: ['abby'], samantha: ['sam'], jessica: ['jess'], nathaniel: ['nate'],
  timothy: ['tim'], edward: ['ed', 'eddie', 'ted'], charles: ['charlie', 'chuck'],
  david: ['dave'], stephen: ['steve'], steven: ['steve'], jeffrey: ['jeff'],
  gregory: ['greg'], kenneth: ['ken'], joshua: ['josh'], patrick: ['pat'],
  theodore: ['theo', 'ted'], zachary: ['zach'], jacob: ['jake'], nicholas: ['nick'],
};

function slug(value) {
  return normalizeName(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}

function levenshtein(left, right) {
  if (left === right) return 0;
  if (!left.length || !right.length) return Math.max(left.length, right.length);
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const current = row[j];
      row[j] = left[i - 1] === right[j - 1] ? previous : 1 + Math.min(previous, row[j], row[j - 1]);
      previous = current;
    }
  }
  return row[right.length];
}

function firstNameAliases(first) {
  const names = new Set([first]);
  for (const alias of NICKNAMES[first] || []) names.add(alias);
  for (const [formal, aliases] of Object.entries(NICKNAMES)) {
    if (formal === first || aliases.includes(first)) {
      names.add(formal);
      aliases.forEach((alias) => names.add(alias));
    }
  }
  return names;
}

function expandFullName(name) {
  const parts = normalizeName(name).split(' ').filter(Boolean);
  if (parts.length < 2) return new Set(parts.length ? [parts[0]] : []);
  const rest = parts.slice(1).join(' ');
  return new Set([...firstNameAliases(parts[0])].map((first) => `${first} ${rest}`));
}

function lookupNames(member) {
  const names = new Set();
  for (const value of [member.name, ...(member.aliases || [])]) {
    const normalized = normalizeName(value || '');
    if (normalized.length < 2) continue;
    names.add(normalized);
    expandFullName(normalized).forEach((variant) => names.add(variant));
  }
  return [...names];
}

function lastName(name) {
  const parts = normalizeName(name).split(' ').filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : '';
}

function firstName(name) {
  return normalizeName(name).split(' ').filter(Boolean)[0] || '';
}

function matchesPerson(query, stored) {
  const q = normalizeName(query);
  const name = normalizeName(stored);
  if (!q || !name) return false;
  if (q === name) return true;
  const queryNames = expandFullName(q);
  const storedNames = expandFullName(name);
  if ([...queryNames].some((variant) => storedNames.has(variant) || variant === name)) return true;
  if (q.split(' ').length === 1 && lastName(name) === q) return true;
  const queryLast = lastName(q);
  const storedLast = lastName(name);
  if (queryLast && storedLast && queryLast === storedLast) {
    const distance = levenshtein(firstName(q), firstName(name));
    if (distance <= 1 && Math.min(firstName(q).length, firstName(name).length) >= 4) return true;
    if ([...firstNameAliases(firstName(q))].some((alias) => levenshtein(alias, firstName(name)) <= 1 && alias.length >= 4)) return true;
  }
  if (Math.min(q.length, name.length) >= 8 && levenshtein(q, name) <= 1) return true;
  return false;
}

function nameIndex(value) {
  const source = String(value || '');
  let normalized = '';
  const chars = [];
  for (let i = 0; i < source.length; i += 1) {
    const piece = source[i].normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[’‘]/g, "'");
    for (const char of piece) {
      normalized += char;
      chars.push(i);
    }
  }
  return { normalized, chars };
}

export function highlightUnmatched(name, query) {
  const q = normalizeName(query);
  const text = String(name || '');
  if (!q) return [{ text, unmatched: true }];
  const { normalized, chars } = nameIndex(text);
  const index = normalized.indexOf(q);
  if (index < 0) return null;
  const start = chars[index];
  const end = chars[index + q.length - 1] + 1;
  return [
    start > 0 ? { text: text.slice(0, start), unmatched: true } : null,
    { text: text.slice(start, end), unmatched: false },
    end < text.length ? { text: text.slice(end), unmatched: true } : null,
  ].filter(Boolean);
}

function displayVariant(sourceName, variant) {
  const sourceParts = String(sourceName).trim().split(/\s+/);
  return variant.split(' ').map((part, index, parts) => {
    if (index === parts.length - 1 && sourceParts.length > 1) return sourceParts.at(-1);
    return part.charAt(0).toUpperCase() + part.slice(1);
  }).join(' ');
}

function suggestionLabels(member) {
  if (member.plusOne || isPlusOneName(member.name || '')) return [];
  const labels = [];
  const add = (value) => {
    const text = String(value || '').trim();
    if (text.length < 2 || isPlusOneName(text)) return;
    if (!labels.some((item) => normalizeName(item) === normalizeName(text))) labels.push(text);
  };
  add(member.name);
  for (const alias of member.aliases || []) add(alias);
  if (member.name && !isPlusOneName(member.name)) {
    for (const variant of expandFullName(member.name)) add(displayVariant(member.name, variant));
  }
  return labels;
}

function suggestionName(member, query) {
  const matches = suggestionLabels(member).filter((name) => highlightUnmatched(name, query));
  if (!matches.length) return '';
  const invitationName = matches.find((name) => normalizeName(name) === normalizeName(member.name));
  if (invitationName) return invitationName;
  return matches.sort((left, right) => right.length - left.length)[0];
}

export function suggestGuests(query, parties) {
  const q = normalizeName(query);
  if (!q) return [];
  const suggestions = [];
  const seen = new Set();
  for (const party of parties) {
    for (const member of party.members || []) {
      const name = suggestionName(member, q);
      if (!name) continue;
      const key = `${party.id}:${member.id || normalizeName(member.name)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      suggestions.push({ name, partyId: party.id, label: party.label, replied: Boolean(party.replied) });
    }
  }
  return suggestions.sort((left, right) => Number(left.replied) - Number(right.replied));
}

export function matchParties(query, parties) {
  const q = normalizeName(query);
  if (q.length < 3) return [];
  const exact = [];
  const close = [];
  for (const party of parties) {
    const names = [...new Set([...(party.search_names || []), ...party.members.flatMap((member) => lookupNames(member))])];
    if (names.some((name) => name === q || expandFullName(q).has(name))) {
      exact.push(party);
      continue;
    }
    if (names.some((name) => matchesPerson(q, name))) close.push(party);
  }
  const matched = exact.length ? exact : close;
  return matched.slice(0, 5).map((party) => ({
    id: party.id,
    label: party.label,
    replied: Boolean(party.replied),
    wishes: party.wishes || '',
    members: party.members.map(({ id, name, plusOne, attending, replyName }) => ({
      id,
      name: replyName || name,
      ...(plusOne ? { plusOne: true } : {}),
      ...(typeof attending === 'boolean' ? { attending } : {}),
    })),
  }));
}

function cell(row, ...keys) {
  const normalized = Object.fromEntries(Object.entries(row).map(([key, value]) => [key.trim().toLowerCase().replace(/\s+/g, '_'), value]));
  for (const key of keys) {
    const value = normalized[key];
    if (value != null && String(value).trim()) return String(value).trim();
  }
  return '';
}

function isPlusOneName(name) {
  return /^(plus[\s-]?ones?(?:\s+\d+)?|guests?|additional guests?)$/i.test(String(name || '').trim());
}

function isChecked(value) {
  return /^(y|yes|true|1)$/i.test(String(value || '').trim());
}

function attendingValue(value) {
  const text = String(value || '').trim().toLowerCase();
  if (['yes', 'y', 'attending', 'true', '1'].includes(text)) return true;
  if (['no', 'n', 'unable', 'unable to attend', 'false', '0'].includes(text)) return false;
  return null;
}

export function partiesFromRows(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const partyId = slug(cell(row, 'party_id', 'party', 'invitation_id', 'group_id'));
    const guestName = cell(row, 'guest_name', 'name', 'full_name');
    const partyName = cell(row, 'party_name', 'family_name', 'invitation', 'group') || guestName;
    if (!partyId || !partyName) continue;
    if (!grouped.has(partyId)) grouped.set(partyId, { id: partyId, label: partyName.slice(0, 200), guests: [], extra: 0, replied: false, wishes: '', replyName: '' });
    const party = grouped.get(partyId);
    if (partyName) party.label = partyName.slice(0, 200);
    if (isChecked(cell(row, 'rsvp_received', 'rsvped', 'rsvp')) || cell(row, 'replied_at') || attendingValue(cell(row, 'attending')) !== null) party.replied = true;
    const wishes = cell(row, 'wishes');
    if (wishes) party.wishes = wishes.slice(0, 2000);
    const replyName = cell(row, 'reply_name', 'plus_one_replies');
    if (replyName) party.replyName = replyName;
    const extra = Number.parseInt(cell(row, 'extra_guests', 'plus_ones', 'plus_one_count', 'additional_guests'), 10);
    if (Number.isFinite(extra)) party.extra = Math.max(party.extra, Math.min(10, extra));
    const plusOne = /^(y|yes|true|1)$/i.test(cell(row, 'plus_one', 'is_plus_one'));
    if (guestName && !isPlusOneName(guestName) && !plusOne) {
      const aliases = cell(row, 'also_known_as', 'nicknames', 'nickname', 'aliases')
        .split(/[,;]/).map((alias) => alias.trim()).filter((alias) => alias.length >= 2 && alias.length <= 120);
      party.guests.push({
        name: guestName.slice(0, 120),
        aliases,
        attending: attendingValue(cell(row, 'attending')),
      });
    } else if (plusOne || isPlusOneName(guestName)) party.extra = Math.max(party.extra, 1);
  }
  return [...grouped.values()].filter((party) => party.guests.length || party.extra).map((party) => {
    const used = new Set();
    const members = party.guests.map((guest) => {
      let id = slug(guest.name) || 'guest';
      if (used.has(id)) {
        let n = 2;
        while (used.has(`${id}-${n}`)) n += 1;
        id = `${id}-${n}`;
      }
      used.add(id);
      return { id, name: guest.name, aliases: guest.aliases, attending: guest.attending };
    });
    const plusReplies = String(party.replyName || '').split(';').map((item) => item.trim()).filter(Boolean);
    for (let index = 1; index <= party.extra; index += 1) {
      const reply = plusReplies[index - 1] || '';
      const [replyName, status] = reply.split(':').map((item) => item.trim());
      members.push({
        id: `plus-one-${index}`,
        name: party.extra === 1 ? 'Plus one' : `Plus one ${index}`,
        plusOne: true,
        replyName: replyName || '',
        attending: attendingValue(status),
      });
    }
    if (!members.length || members.length > 30) return null;
    const search_names = [...new Set(members.filter((member) => !member.plusOne && !isPlusOneName(member.name)).flatMap((member) => lookupNames(member)))];
    return { id: party.id, label: party.label, members, search_names, replied: party.replied, wishes: party.wishes };
  }).filter(Boolean);
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const source = String(text || '').replace(/^\uFEFF/, '');
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') { field += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (char !== '\r') field += char;
  }
  row.push(field);
  if (row.some((value) => value.trim())) rows.push(row);
  if (!rows.length) return [];
  const headers = rows.shift().map((header) => header.trim().toLowerCase().replace(/\s+/g, '_'));
  return rows
    .filter((values) => values.some((value) => value.trim()))
    .map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ''])));
}
