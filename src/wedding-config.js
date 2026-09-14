export const weddingConfig = {
  rsvpDeadline: 'October 31, 2026',
  contactEmail: 'AndrewKatieTorres@gmail.com',
  rsvpEndpoint: 'https://uyhzqldiukfmugasiapi.supabase.co/functions/v1/wedding-rsvp',
  dressInspirationUrl: 'https://www.pinterest.com/',
  registries: [
    { name: 'View full registry', url: 'https://registry.theknot.com/andrew-torres-katie-ferguson-may-2027-ia/78612430' },
  ],
  registryMemberId: 'c2e35b1d-7cf4-4623-8f71-cd93e67a49cc',
  registryPreviewLimit: 8,
  weddingParty: {
    katie: [
      {
        title: 'Parents',
        people: [
          { name: 'John Ferguson', role: 'Father of the Bride' },
          { name: 'Theresa Ferguson', role: 'Mother of the Bride' },
        ],
      },
      {
        title: 'Bridal Party',
        people: [
          { name: 'Lily Ferguson', role: 'Maid of Honor' },
          { name: 'Gabby Ferguson', role: 'Bridesmaid' },
          { name: 'Molly Ferguson', role: 'Bridesmaid' },
          { name: 'Angelica Torres', role: 'Bridesmaid' },
          { name: 'Lexi Cabindol', role: 'Bridesmaid' },
          { name: 'Emily Village', role: 'Bridesmaid' },
        ],
      },
    ],
    andrew: [
      {
        title: 'Parents',
        people: [
          { name: 'Maria Torres', role: 'Mother of the Groom' },
        ],
      },
      {
        title: 'Groomsmen',
        people: [
          { name: 'Andy Cabindol', role: 'Best Man' },
          { name: 'Sam Feldmann', role: 'Best Man' },
          { name: 'Eli Norris', role: 'Groomsman' },
          { name: 'Keagan Morrisroe', role: 'Groomsman' },
          { name: 'Michael Meis', role: 'Groomsman' },
          { name: 'Spencer Rea', role: 'Groomsman' },
        ],
      },
      {
        title: 'Ushers',
        people: [
          { name: 'Dominic Tran', role: 'Usher' },
          { name: 'Max Lautenschlager', role: 'Usher' },
        ],
      },
    ],
  },
};

function money(cents) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format((cents || 0) / 100);
}

function registryItemUrl() {
  return weddingConfig.registries[0].url;
}

function itemImageUrl(item) {
  return item.imageUrl || item.imageUrls?.[0] || '';
}

function splitGiftTitle(name) {
  const title = (name || '').trim();
  if (!title) return { primary: '', detail: '' };

  const comma = title.indexOf(',');
  if (comma >= 12 && comma <= 72 && title.length - comma > 18) {
    return {
      primary: title.slice(0, comma).trim(),
      detail: title.slice(comma + 1).trim().replace(/^\|\s*/, ''),
    };
  }

  const pipe = title.indexOf('|');
  if (pipe > 0) {
    return {
      primary: title.slice(0, pipe).trim().replace(/[,\s]+$/, ''),
      detail: title.slice(pipe + 1).trim(),
    };
  }

  const dashMatch = title.match(/^(.+?)\s[-–—]\s(.+)$/);
  if (dashMatch && dashMatch[1].length >= 12) {
    return { primary: dashMatch[1].trim(), detail: dashMatch[2].trim() };
  }

  return { primary: title, detail: '' };
}

function renderGiftName(itemName) {
  const { primary, detail } = splitGiftTitle(itemName);
  const name = document.createElement('h3');
  name.className = 'gift-item__name';

  const primaryEl = document.createElement('span');
  primaryEl.className = 'gift-item__name-primary';
  primaryEl.textContent = primary;
  name.append(primaryEl);

  if (detail) {
    const detailEl = document.createElement('span');
    detailEl.className = 'gift-item__name-detail';
    detailEl.textContent = detail;
    name.append(detailEl);
  }

  return name;
}

function renderRegistryItems(list, items, error) {
  list.replaceChildren();
  if (error || !items.length) {
    const note = document.createElement('p');
    note.className = 'gifts__empty';
    note.textContent = error
      ? 'The registry is available from the button below.'
      : 'No gifts are listed yet.';
    list.append(note);
    return;
  }

  const preview = items.slice(0, weddingConfig.registryPreviewLimit);

  preview.forEach((item) => {
    const remaining = Math.max(0, (item.numRequested || 0) - (item.numReceived || 0));
    const card = document.createElement('a');
    card.className = 'gift-item';
    card.href = registryItemUrl();
    card.target = '_blank';
    card.rel = 'noopener noreferrer';

    const imageSrc = itemImageUrl(item);
    if (imageSrc) {
      const image = document.createElement('img');
      image.src = imageSrc;
      image.alt = '';
      image.loading = 'lazy';
      image.referrerPolicy = 'no-referrer';
      card.append(image);
    }

    const body = document.createElement('div');
    body.className = 'gift-item__body';

    const brandLabel = item.brandName || item.retailerName || item.store;
    if (brandLabel) {
      const brand = document.createElement('p');
      brand.className = 'gift-item__brand';
      brand.textContent = brandLabel;
      body.append(brand);
    }

    body.append(renderGiftName(item.name));

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

function renderPartyPerson(person) {
  const item = document.createElement('article');
  item.className = 'party-person';

  if (person.photo) {
    const image = document.createElement('img');
    image.className = 'party-person__photo';
    image.src = person.photo;
    image.alt = person.name || '';
    image.loading = 'lazy';
    item.append(image);
  } else {
    const placeholder = document.createElement('div');
    placeholder.className = 'party-person__photo party-person__photo--empty';
    placeholder.setAttribute('aria-hidden', 'true');
    item.append(placeholder);
  }

  if (person.role) {
    const role = document.createElement('p');
    role.className = 'party-person__role';
    role.textContent = person.role;
    item.append(role);
  }

  const name = document.createElement('h3');
  name.className = 'party-person__name';
  name.textContent = person.name;
  item.append(name);

  if (person.note) {
    const note = document.createElement('p');
    note.className = 'body-text party-person__note';
    note.textContent = person.note;
    item.append(note);
  }

  return item;
}

function renderPartyGroup(group) {
  const section = document.createElement('div');
  section.className = 'party-group';

  const grid = document.createElement('div');
  grid.className = 'party-people';
  grid.append(...(group.people || []).map(renderPartyPerson));
  section.append(grid);
  return section;
}

function renderWeddingParty() {
  const root = document.querySelector('[data-wedding-party]');
  if (!root) return;

  const party = weddingConfig.weddingParty || {};
  root.querySelectorAll('[data-party-side]').forEach((list) => {
    const side = list.dataset.partySide;
    const groups = party[side] || [];
    list.replaceChildren();

    if (!groups.length) {
      const empty = document.createElement('p');
      empty.className = 'body-text party-side__empty';
      empty.textContent = 'Coming soon.';
      list.append(empty);
      return;
    }

    list.append(...groups.map(renderPartyGroup));
  });
}

export function initWeddingContent() {
  document.querySelectorAll('[data-rsvp-deadline]').forEach((el) => {
    el.textContent = weddingConfig.rsvpDeadline;
  });
  document.querySelectorAll('[data-dress-inspiration]').forEach((el) => {
    if (weddingConfig.dressInspirationUrl) {
      el.href = weddingConfig.dressInspirationUrl;
    }
  });
  const links = document.querySelector('.gifts__links');
  if (links) {
    links.replaceChildren(...weddingConfig.registries.map((registry) => {
      const link = document.createElement('a');
      link.href = registry.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.className = 'btn btn--secondary';
      link.textContent = registry.name;
      return link;
    }));
  }
  loadRegistryItems();
  renderWeddingParty();
}
