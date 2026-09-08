/**
 * Bound to the Katie & Andrew guest sheet.
 * Deploy as a web app, execute as you, accessible to anyone.
 * Set the script property RSVP_SHEET_SECRET, and the same value in Supabase.
 */
const HEADERS = ['party_id', 'party_name', 'guest_name', 'also_known_as', 'extra_guests', 'notes', 'rsvp_received', 'attending', 'reply_name', 'wishes', 'replied_at'];

function sheet_() {
  const file = SpreadsheetApp.getActive();
  const named = file.getSheetByName('rsvp-guests.template') || file.getSheetByName('Guests');
  if (named) return named;
  const sheets = file.getSheets();
  for (const candidate of sheets) {
    if (String(candidate.getRange(1, 1).getValue()).trim().toLowerCase() === 'party_id') return candidate;
  }
  return sheets[0];
}

function headerMap_(sheet) {
  const lastColumn = Math.max(sheet.getLastColumn(), HEADERS.length);
  const current = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map((value) => String(value).trim().toLowerCase().replace(/\s+/g, '_'));
  HEADERS.forEach((header, index) => {
    if (!current.includes(header)) {
      const column = current.findIndex((value) => value) === -1 && index === 0 ? 1 : current.filter(Boolean).length + 1;
      sheet.getRange(1, column).setValue(header);
      current[column - 1] = header;
    }
  });
  const rsvpColumn = current.indexOf('rsvp_received') + 1;
  if (rsvpColumn) sheet.getRange(2, rsvpColumn, Math.max(sheet.getMaxRows() - 1, 1), 1).insertCheckboxes();
  return Object.fromEntries(current.map((header, index) => [header, index]));
}

function doGet(event) {
  if (!authorized_(event && event.parameter && event.parameter.secret)) return json_({ error: 'unauthorized' });
  const sheet = sheet_();
  const columns = headerMap_(sheet);
  const values = sheet.getDataRange().getValues();
  const headers = values.shift().map((value) => String(value).trim().toLowerCase().replace(/\s+/g, '_'));
  const rows = values.filter((row) => row.some((value) => String(value).trim())).map((row) => {
    const record = {};
    headers.forEach((header, index) => { if (header) record[header] = row[index]; });
    return record;
  });
  return json_({ rows, columns: Object.keys(columns) });
}

function doPost(event) {
  const body = JSON.parse(event.postData.contents);
  if (!authorized_(body.secret)) return json_({ error: 'unauthorized' });
  const sheet = sheet_();
  const columns = headerMap_(sheet);
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map((value) => String(value).trim().toLowerCase().replace(/\s+/g, '_'));
  const responses = Array.isArray(body.responses) ? body.responses : [];
  let wrote = 0;
  for (let row = 1; row < values.length; row += 1) {
    const partyId = String(values[row][columns.party_id] || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (partyId !== String(body.invitation_id || '').trim()) continue;
    const guestName = String(values[row][columns.guest_name] || '').trim().toLowerCase();
    const answer = responses.find((item) => String(item.name || '').trim().toLowerCase() === guestName || String(item.id || '') === slug_(guestName));
    set_(sheet, row + 1, columns.rsvp_received, true);
    if (row === firstPartyRow_(values, columns, partyId) - 1) {
      set_(sheet, row + 1, columns.wishes, body.wishes || '');
      set_(sheet, row + 1, columns.replied_at, body.updated_at || new Date().toISOString());
      const plusOnes = responses.filter((item) => item.plusOne);
      if (plusOnes.length) set_(sheet, row + 1, columns.reply_name, plusOnes.map((item) => `${item.name}: ${item.attending ? 'Attending' : 'Unable to attend'}`).join('; '));
    }
    if (answer && !answer.plusOne) set_(sheet, row + 1, columns.attending, answer.attending ? 'Yes' : 'No');
    wrote += 1;
  }
  return json_({ ok: true, updated: wrote });
}

function firstPartyRow_(values, columns, partyId) {
  for (let row = 1; row < values.length; row += 1) {
    const id = String(values[row][columns.party_id] || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (id === partyId) return row + 1;
  }
  return 2;
}

function set_(sheet, row, column, value) {
  if (column == null || column < 0) return;
  sheet.getRange(row, column + 1).setValue(value);
}

function slug_(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function authorized_(secret) {
  const expected = PropertiesService.getScriptProperties().getProperty('RSVP_SHEET_SECRET');
  return Boolean(expected) && secret === expected;
}

function json_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
