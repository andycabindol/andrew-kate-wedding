import { parseCsv, partiesFromRows } from './matching.js';

export const GUEST_SHEET_ID = '1sV27HMCN8Ed9fL3sgCSeqNR4RhjGQ3alWkBz6gbONhY';
export const GUEST_SHEET_CSV_URL = `https://docs.google.com/spreadsheets/d/${GUEST_SHEET_ID}/export?format=csv&gid=2002847235`;

export function createSheet({ url, secret, csvUrl, fetcher = fetch } = {}) {
  const configured = Boolean((url && secret) || csvUrl);
  async function loadRows() {
    if (url && secret) {
      const response = await fetcher(`${url}${url.includes('?') ? '&' : '?'}secret=${encodeURIComponent(secret)}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) throw new Error('Guest sheet request failed');
      const data = await response.json();
      if (Array.isArray(data.rows)) return data.rows;
      if (Array.isArray(data.parties)) return null;
    }
    if (!csvUrl) throw new Error('Guest sheet is not configured');
    const response = await fetcher(csvUrl, { signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error('Guest sheet request failed');
    return parseCsv(await response.text());
  }
  return {
    configured,
    async loadParties() {
      if (!configured) return null;
      const rows = await loadRows();
      return partiesFromRows(rows || []);
    },
    async writeRsvp(data) {
      if (!url || !secret) return;
      const response = await fetcher(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret, ...data }),
        signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) throw new Error('Could not update the guest sheet');
    },
  };
}
