export const weddingConfig = {
  rsvpDeadline: 'October 30, 2026',
  contactEmail: 'katieferg93@gmail.com',
  rsvpEndpoint: 'https://uyhzqldiukfmugasiapi.supabase.co/functions/v1/wedding-rsvp',
  guestSheetCsvUrl: 'https://docs.google.com/spreadsheets/d/1sV27HMCN8Ed9fL3sgCSeqNR4RhjGQ3alWkBz6gbONhY/export?format=csv&gid=2002847235',
  registries: [
    { name: 'Open Registry', url: 'https://registry.theknot.com/andrew-torres-katie-ferguson-may-2027-ia/78612430' },
  ],
  registryMemberId: 'c2e35b1d-7cf4-4623-8f71-cd93e67a49cc',
};

function money(cents) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format((cents || 0) / 100);
}

function registryItemUrl() {
  return weddingConfig.registries[0].url;
}

function renderRegistryItems(list, items, error) {
  list.replaceChildren();
  if (error || !items.length) {
    const note = document.createElement('p');
    note.className = 'gifts__empty';
    note.textContent = error
      ? 'The registry is available from the button above.'
      : 'No gifts are listed yet.';
    list.append(note);
    return;
  }

  items.forEach((item) => {
    const remaining = Math.max(0, (item.numRequested || 0) - (item.numReceived || 0));
    const card = document.createElement('a');
    card.className = 'gift-item';
    card.href = registryItemUrl();
    card.target = '_blank';
    card.rel = 'noopener noreferrer';

    const image = document.createElement('img');
    image.src = item.imageUrl;
    image.alt = '';
    card.append(image);

    const body = document.createElement('div');
    body.className = 'gift-item__body';

    if (item.brandName) {
      const brand = document.createElement('p');
      brand.className = 'gift-item__brand';
      brand.textContent = item.brandName;
      body.append(brand);
    }

    const name = document.createElement('h3');
    name.className = 'gift-item__name';
    name.textContent = item.name;
    body.append(name);

    const price = document.createElement('p');
    price.className = 'gift-item__price';
    price.textContent = money(item.priceCents);
    body.append(price);

    const status = document.createElement('p');
    status.className = 'gift-item__status';
    status.textContent = remaining ? `Needs ${remaining}` : 'Purchased';
    body.append(status);

    card.append(body);
    list.append(card);
  });
}

async function loadRegistryItems() {
  const list = document.querySelector('.gifts__items');
  if (!list || !weddingConfig.registryMemberId) return;

  const url = new URL('https://registry-item-gateway.regsvcs.theknot.com/guest/items');
  url.searchParams.set('limit', '100');
  url.searchParams.set('memberId', weddingConfig.registryMemberId);
  url.searchParams.set('showCash', 'false');
  url.searchParams.set('showGiftCards', 'true');
  url.searchParams.set('showDisabled', 'false');
  url.searchParams.set('registryStatusFilter', 'active,visible');
  url.searchParams.set('sort', 'retailerSortOrder-asc');

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('registry unavailable');
    const payload = await response.json();
    renderRegistryItems(list, payload.data || []);
  } catch {
    renderRegistryItems(list, [], true);
  }
}

export function initWeddingContent() {
  document.querySelectorAll('[data-rsvp-deadline]').forEach((el) => {
    el.textContent = weddingConfig.rsvpDeadline;
  });
  const links = document.querySelector('.gifts__links');
  if (links) {
    links.replaceChildren(...weddingConfig.registries.map((registry, index) => {
      const link = document.createElement('a');
      link.href = registry.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.className = `gifts__link${index ? ' gifts__link--secondary' : ''}`;
      link.textContent = registry.name;
      return link;
    }));
  }
  loadRegistryItems();
}
