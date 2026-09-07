export const weddingConfig = {
  rsvpDeadline: 'October 30, 2026',
  contactEmail: 'katieferg93@gmail.com',
  rsvpEndpoint: 'https://uyhzqldiukfmugasiapi.supabase.co/functions/v1/wedding-rsvp',
  registries: [
    { name: 'The Knot', url: 'https://registry.theknot.com/andrew-torres-katie-ferguson-may-2027-ia/78612430' },
    // Add the couple’s direct Amazon and Target registry URLs here when ready.
  ],
};

export function initWeddingContent() {
  document.querySelectorAll('[data-rsvp-deadline]').forEach((el) => {
    el.textContent = weddingConfig.rsvpDeadline;
  });
  const links = document.querySelector('.gifts__links');
  if (!links) return;
  links.replaceChildren(...weddingConfig.registries.map((registry, index) => {
    const link = document.createElement('a');
    link.href = registry.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.className = `gifts__link${index ? ' gifts__link--secondary' : ''}`;
    link.textContent = registry.name;
    link.setAttribute('aria-label', `View our ${registry.name} registry`);
    return link;
  }));
}
