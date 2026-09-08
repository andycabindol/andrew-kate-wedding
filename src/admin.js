import { weddingConfig } from './wedding-config.js';
import { parseCsv } from '../supabase/functions/wedding-rsvp/matching.js';

const tokenKey = 'katie-andrew-admin';
const login = document.getElementById('adminLogin');
const app = document.getElementById('adminApp');
const list = document.getElementById('adminList');
const editor = document.getElementById('adminEditor');
const members = document.getElementById('partyMembers');
let parties = [];
let filter = 'all';
let editing = null;
let autoGroupName = '';

function token() {
  try { return sessionStorage.getItem(tokenKey) || ''; } catch { return ''; }
}

function remember(value) {
  sessionStorage.setItem(tokenKey, value);
}

async function request(body) {
  const response = await fetch(weddingConfig.rsvpEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || 'Something went wrong.');
    error.status = response.status;
    throw error;
  }
  return data;
}

function guestCount(party) {
  return party.members.filter((member) => member.attending === true).length;
}

function showLogin(message = '') {
  app.hidden = true;
  login.hidden = false;
  document.getElementById('adminLoginStatus').textContent = message;
}

function partyMatches(party) {
  if (filter === 'replied') return party.replied;
  if (filter === 'waiting') return !party.replied;
  return true;
}

function partySnapshot(items) {
  return JSON.stringify(items.map((party) => ({
    id: party.id,
    label: party.label,
    replied: party.replied,
    wishes: party.wishes,
    members: party.members.map((member) => ({
      id: member.id, name: member.name, attending: member.attending, plusOne: member.plusOne,
    })),
  })));
}

let refreshing = false;

async function refreshParties() {
  if (refreshing || app.hidden || document.hidden) return;
  refreshing = true;
  try {
    const data = await request({ action: 'admin-list', token: token() });
    const next = data.parties || [];
    if (partySnapshot(next) === partySnapshot(parties)) return;
    parties = next;
    render();
  } catch (error) {
    if (error.status === 401) showLogin('Please sign in again.');
  } finally {
    refreshing = false;
  }
}

function render() {
  const visible = parties.filter(partyMatches);
  const invited = parties.reduce((total, party) => total + party.members.length, 0);
  const attending = parties.reduce((total, party) => total + guestCount(party), 0);
  document.getElementById('adminSummary').textContent = `${invited} invited, ${attending} attending`;
  list.replaceChildren();
  for (const party of visible) {
    const card = document.createElement('article');
    card.className = `admin__card${party.replied ? ' is-replied' : ''}`;
    const head = document.createElement('div');
    head.className = 'admin__card-head';
    const title = document.createElement('h2');
    title.textContent = party.label;
    const yes = party.members.filter((member) => member.attending === true).length;
    const no = party.members.filter((member) => member.attending === false).length;
    const badge = document.createElement('span');
    badge.className = `admin__badge${party.replied ? (yes ? ' is-yes' : ' is-no') : ''}`;
    badge.textContent = party.replied ? `${yes} yes${no ? ` · ${no} no` : ''}` : 'Waiting';
    head.append(title, badge);
    const people = document.createElement('div');
    people.className = 'admin__people';
    for (const member of party.members) {
      const item = document.createElement('div');
      item.className = `admin__person${member.attending === true ? ' is-yes' : member.attending === false ? ' is-no' : ' is-waiting'}`;
      const name = document.createElement('p');
      const shown = member.plusOne && member.name && !/^plus one/i.test(member.name) ? member.name : member.name;
      name.textContent = `${shown}${member.plusOne ? ' · plus one' : ''}`;
      const attendance = document.createElement('select');
      attendance.className = 'admin__attendance';
      attendance.setAttribute('aria-label', `Attendance for ${shown}`);
      for (const [value, label] of [['', 'No reply yet'], ['yes', 'Attending'], ['no', 'Unable to attend']]) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        attendance.append(option);
      }
      attendance.value = member.attending === true ? 'yes' : member.attending === false ? 'no' : '';
      attendance.addEventListener('change', () => saveAttendance(party, member, attendance));
      item.append(name, attendance);
      people.append(item);
    }
    card.append(head, people);
    if (party.wishes) {
      const note = document.createElement('div');
      note.className = 'admin__wishes';
      const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      icon.setAttribute('viewBox', '0 0 256 256');
      icon.setAttribute('fill', 'none');
      icon.setAttribute('aria-hidden', 'true');
      for (const d of [
        'M108,144H40a8,8,0,0,1-8-8V72a8,8,0,0,1,8-8h60a8,8,0,0,1,8,8v88a36,36,0,0,1-36,36',
        'M224,144H156a8,8,0,0,1-8-8V72a8,8,0,0,1,8-8h60a8,8,0,0,1,8,8v88a36,36,0,0,1-36,36',
      ]) {
        const shape = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        shape.setAttribute('d', d);
        shape.setAttribute('fill', 'none');
        shape.setAttribute('stroke', 'currentColor');
        shape.setAttribute('stroke-linecap', 'round');
        shape.setAttribute('stroke-linejoin', 'round');
        shape.setAttribute('stroke-width', '12');
        icon.append(shape);
      }
      const text = document.createElement('p');
      text.textContent = party.wishes;
      note.append(icon, text);
      card.append(note);
    }
    const actions = document.createElement('div');
    actions.className = 'admin__card-actions';
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'btn btn--dark';
    copy.textContent = 'Copy invitation link';
    copy.addEventListener('click', async () => {
      const url = new URL('/rsvp', location.origin);
      url.searchParams.set('party', party.id);
      try {
        await navigator.clipboard.writeText(url.toString());
        copy.textContent = 'Copied';
      } catch {
        copy.textContent = 'Copy failed';
      }
      window.setTimeout(() => { copy.textContent = 'Copy invitation link'; }, 1600);
    });
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'btn btn--secondary';
    edit.textContent = 'Edit';
    edit.addEventListener('click', () => openEditor(party));
    const trailing = document.createElement('div');
    trailing.className = 'admin__card-trailing';
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'btn btn--text';
    clear.textContent = 'Clear';
    clear.addEventListener('click', () => clearParty(party));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'btn btn--text admin__delete';
    remove.textContent = 'Delete';
    remove.addEventListener('click', () => removeParty(party));
    trailing.append(clear, remove);
    actions.append(copy, edit, trailing);
    card.append(actions);
    list.append(card);
  }
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'admin__add admin__add--row';
  add.textContent = '+ Add Invitation';
  add.addEventListener('click', () => openEditor(null));
  list.append(add);
}

function field(labelText, input) {
  const wrap = document.createElement('label');
  wrap.className = 'admin__field';
  const caption = document.createElement('span');
  caption.textContent = labelText;
  wrap.append(caption, input);
  return wrap;
}

function namedGuests() {
  return [...members.querySelectorAll('.admin__member')].filter((row) => !row.dataset.plus);
}

function groupNameFromGuest(name) {
  const first = name.trim().split(/\s+/)[0];
  return first ? `${first}’s Group` : '';
}

function syncInvitationName() {
  const labelField = document.getElementById('partyLabelField');
  const label = document.getElementById('partyLabel');
  const people = namedGuests();
  if (people.length === 1) {
    label.value = people[0].querySelector('[data-role="name"]').value.trim();
    autoGroupName = '';
    label.required = false;
    labelField.hidden = true;
  } else {
    const guestName = people[0]?.querySelector('[data-role="name"]')?.value.trim() || '';
    const next = groupNameFromGuest(guestName);
    const current = label.value.trim();
    if (autoGroupName !== null && (!current || current === guestName || current === autoGroupName)) {
      label.value = next;
      autoGroupName = next;
    } else autoGroupName = null;
    label.required = true;
    labelField.hidden = false;
  }
  for (const row of people) {
    const remove = row.querySelector('.admin__remove');
    if (remove) remove.hidden = people.length <= 1;
  }
}

function memberRow(member = {}) {
  const row = document.createElement('div');
  row.className = member.plusOne ? 'admin__member admin__member--plus' : 'admin__member';
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'admin__remove';
  remove.textContent = 'Remove';
  remove.addEventListener('click', () => {
    if (!member.plusOne && namedGuests().length <= 1) return;
    row.remove();
    syncInvitationName();
  });
  if (member.id) row.dataset.id = member.id;
  if (member.plusOne) {
    row.dataset.plus = 'true';
    const note = document.createElement('p');
    note.className = 'admin__plus-note';
    note.textContent = 'Plus one. They’ll add this guest’s name when they RSVP.';
    row.append(note, remove);
    return row;
  }
  const name = document.createElement('input');
  name.value = member.name || '';
  name.maxLength = 120;
  name.required = true;
  name.dataset.role = 'name';
  name.addEventListener('input', syncInvitationName);
  const alias = document.createElement('input');
  alias.value = (member.aliases || []).join(', ');
  alias.maxLength = 200;
  alias.dataset.role = 'aliases';
  row.append(field('Guest name', name), field('Nicknames', alias), remove);
  return row;
}

function openEditor(party) {
  editing = party;
  autoGroupName = '';
  document.getElementById('adminEditorTitle').textContent = party ? 'Edit invitation' : 'Add invitation';
  document.getElementById('partyLabel').value = party?.label || '';
  members.replaceChildren(...(party?.members || [{ name: '' }]).map((member) => memberRow(member)));
  syncInvitationName();
  editor.showModal();
  document.getElementById('partyLabel').focus();
}

async function saveAttendance(party, member, select) {
  const attending = select.value === 'yes' ? true : select.value === 'no' ? false : null;
  select.disabled = true;
  try {
    await request({ action: 'admin-attendance', token: token(), id: party.id, memberId: member.id, attending });
    await refreshParties();
  } catch (error) {
    if (error.status === 401) showLogin('Please sign in again.');
    else document.getElementById('adminStatus').textContent = error.message;
    select.value = member.attending === true ? 'yes' : member.attending === false ? 'no' : '';
  } finally {
    select.disabled = false;
  }
}

async function loadParties() {
  const data = await request({ action: 'admin-list', token: token() });
  parties = data.parties || [];
  render();
}

async function clearParty(party) {
  if (!window.confirm(`Clear ${party.label}? Their reply will be removed and the invitation will go back to no response.`)) return;
  document.getElementById('adminStatus').textContent = 'Clearing…';
  try {
    await request({ action: 'admin-clear', token: token(), id: party.id });
    await refreshParties();
    document.getElementById('adminStatus').textContent = '';
  } catch (error) {
    if (error.status === 401) showLogin('Please sign in again.');
    else document.getElementById('adminStatus').textContent = error.message;
  }
}

async function removeParty(party) {
  if (!window.confirm(`Remove ${party.label}? Their reply will be deleted too.`)) return;
  document.getElementById('adminStatus').textContent = 'Removing…';
  try {
    await request({ action: 'admin-delete', token: token(), id: party.id });
    parties = parties.filter((item) => item.id !== party.id);
    render();
    document.getElementById('adminStatus').textContent = '';
  } catch (error) {
    if (error.status === 401) showLogin('Please sign in again.');
    else document.getElementById('adminStatus').textContent = error.message;
  }
}

login.addEventListener('submit', async (event) => {
  event.preventDefault();
  const password = document.getElementById('adminPassword').value;
  document.getElementById('adminLoginStatus').textContent = 'Checking…';
  try {
    const data = await request({ action: 'admin-login', password });
    remember(data.token);
    document.getElementById('adminPassword').value = '';
    login.hidden = true;
    app.hidden = false;
    await loadParties();
  } catch (error) {
    document.getElementById('adminLoginStatus').textContent = error.message;
  }
});

document.querySelectorAll('.admin__filters button').forEach((button) => {
  button.addEventListener('click', () => {
    filter = button.dataset.filter;
    document.querySelectorAll('.admin__filters button').forEach((item) => item.classList.toggle('is-active', item === button));
    render();
  });
});

const tableHeaders = ['group_id', 'group_name', 'guest_id', 'guest_name', 'nicknames', 'plus_one', 'attending', 'wishes'];

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadTable(filename, rows) {
  const csv = [tableHeaders, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function tableRowsFromParties(items) {
  return items.flatMap((party) => party.members.map((member, index) => [
    party.id,
    party.label,
    member.id,
    member.plusOne && /^plus one/i.test(member.name || '') ? '' : member.name,
    (member.aliases || []).join(', '),
    member.plusOne ? 'yes' : '',
    member.attending === true ? 'yes' : member.attending === false ? 'no' : '',
    index === 0 ? party.wishes || '' : '',
  ]));
}

document.getElementById('adminDownload').addEventListener('click', () => {
  downloadTable('katie-andrew-guest-list.csv', tableRowsFromParties(parties));
});

document.getElementById('adminTemplate').addEventListener('click', () => {
  downloadTable('katie-andrew-guest-template.csv', [
    ['', 'Example Family', '', 'Alex Example', 'Alex', '', '', ''],
    ['', 'Example Family', '', 'Jordan Example', '', '', '', ''],
    ['', 'Example Family', '', '', '', 'yes', '', ''],
  ]);
});

document.getElementById('adminUpload').addEventListener('click', () => {
  document.getElementById('adminFile').click();
});

async function uploadTableFile(file) {
  if (!file) return;
  if (!/\.csv$/i.test(file.name) && file.type && !/csv|text\/plain|excel/.test(file.type)) {
    document.getElementById('adminStatus').textContent = 'Upload a CSV file.';
    return;
  }
  document.getElementById('adminStatus').textContent = 'Uploading table…';
  try {
    const rows = parseCsv(await file.text());
    if (!rows.length) throw new Error('The table is empty.');
    const data = await request({ action: 'admin-import', token: token(), rows });
    await refreshParties();
    document.getElementById('adminStatus').textContent = `Updated ${data.imported} group${data.imported === 1 ? '' : 's'}.`;
  } catch (error) {
    if (error.status === 401) showLogin('Please sign in again.');
    else document.getElementById('adminStatus').textContent = error.message;
  }
}

document.getElementById('adminFile').addEventListener('change', (event) => {
  const file = event.target.files?.[0];
  event.target.value = '';
  uploadTableFile(file);
});

const dropLayer = document.getElementById('adminDrop');
let dragDepth = 0;

function isFileDrag(event) {
  return [...(event.dataTransfer?.types || [])].includes('Files');
}

function showDrop() {
  dropLayer.hidden = false;
}

function hideDrop() {
  dragDepth = 0;
  dropLayer.hidden = true;
}

window.addEventListener('dragenter', (event) => {
  if (!isFileDrag(event)) return;
  event.preventDefault();
  dragDepth += 1;
  showDrop();
});

window.addEventListener('dragover', (event) => {
  if (!isFileDrag(event)) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy';
});

window.addEventListener('dragleave', (event) => {
  if (!isFileDrag(event)) return;
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) dropLayer.hidden = true;
});

window.addEventListener('drop', (event) => {
  if (!isFileDrag(event)) return;
  event.preventDefault();
  hideDrop();
  uploadTableFile(event.dataTransfer.files?.[0]);
});

window.addEventListener('dragend', hideDrop);

document.getElementById('adminAdd').addEventListener('click', () => openEditor(null));
document.getElementById('addGuest').addEventListener('click', () => {
  members.append(memberRow());
  syncInvitationName();
});
document.getElementById('addPlusOne').addEventListener('click', () => {
  members.append(memberRow({ plusOne: true }));
  syncInvitationName();
});
document.getElementById('adminCancel').addEventListener('click', () => editor.close());

document.getElementById('adminForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const rows = [...members.querySelectorAll('.admin__member')];
  const party = {
    id: editing?.id,
    label: namedGuests().length === 1
      ? namedGuests()[0].querySelector('[data-role="name"]').value.trim()
      : document.getElementById('partyLabel').value.trim(),
    members: rows.map((row) => row.dataset.plus
      ? { id: row.dataset.id, plusOne: true }
      : {
        id: row.dataset.id,
        name: row.querySelector('[data-role="name"]').value.trim(),
        aliases: row.querySelector('[data-role="aliases"]').value.split(',').map((item) => item.trim()).filter(Boolean),
      }),
  };
  document.getElementById('adminStatus').textContent = 'Saving…';
  try {
    await request({ action: 'admin-save', token: token(), party });
    editor.close();
    await loadParties();
    document.getElementById('adminStatus').textContent = 'Saved.';
  } catch (error) {
    if (error.status === 401) {
      editor.close();
      showLogin('Please sign in again.');
    } else document.getElementById('adminStatus').textContent = error.message;
  }
});

if (token()) {
  login.hidden = true;
  app.hidden = false;
  loadParties().catch((error) => {
    if (error.status === 401) showLogin('Please sign in again.');
    else document.getElementById('adminStatus').textContent = error.message;
  });
} else {
  showLogin();
}

window.setInterval(refreshParties, 4000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refreshParties();
});
