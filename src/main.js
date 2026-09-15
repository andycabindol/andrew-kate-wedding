import Lenis from 'lenis';
import 'lenis/dist/lenis.css';
import { initSiteGate } from './gate.js';
import { initRsvp } from './rsvp.js';
import { initWeddingContent } from './wedding-config.js';

// Smooth scrolling (matches the Framer site's Lenis setup)
const lenis = new Lenis({
  duration: 1.4,
  easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
  smoothWheel: true,
  touchMultiplier: 1.5,
});

function raf(time) {
  lenis.raf(time);
  requestAnimationFrame(raf);
}

requestAnimationFrame(raf);
lenis.stop();

function mountSite() {
  const template = document.getElementById('siteContent');
  if (!template || document.getElementById('rsvp')) return;
  document.body.append(template.content);
}

let updateNav = () => {};

function randBetween(min, max) {
  return min + Math.random() * (max - min);
}

function shuffleList(list) {
  const items = [...list];
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function scrambleBloomFlourish(host) {
  const items = [...host.querySelectorAll('.bloom-flourish__item')];
  if (!items.length) return;

  // Keep blooms parked on corners only, with outward offsets (never into the center).
  const slots = shuffleList([
    {
      left: () => `${randBetween(-28, -10)}px`,
      top: () => `${randBetween(-22, -8)}px`,
      right: 'auto',
      bottom: 'auto',
    },
    {
      left: 'auto',
      right: () => `${randBetween(-26, -8)}px`,
      top: () => `${randBetween(-22, -8)}px`,
      bottom: 'auto',
    },
    {
      left: () => `${randBetween(-28, -10)}px`,
      top: 'auto',
      right: 'auto',
      bottom: () => `${randBetween(-26, -8)}px`,
    },
    {
      left: 'auto',
      right: () => `${randBetween(-26, -8)}px`,
      top: 'auto',
      bottom: () => `${randBetween(-26, -8)}px`,
    },
  ]).slice(0, items.length);

  const sized = shuffleList(items);
  sized.forEach((el, index) => {
    const slot = slots[index];
    const isVine = el.classList.contains('bloom-flourish__item--vine');
    const size = isVine
      ? randBetween(44, 60)
      : index === 0
        ? randBetween(28, 38)
        : randBetween(18, 28);

    el.style.left = typeof slot.left === 'function' ? slot.left() : slot.left;
    el.style.right = typeof slot.right === 'function' ? slot.right() : slot.right;
    el.style.top = typeof slot.top === 'function' ? slot.top() : slot.top;
    el.style.bottom = typeof slot.bottom === 'function' ? slot.bottom() : slot.bottom;
    el.style.setProperty('--bloom-size', `${size.toFixed(1)}px`);
    el.style.setProperty('--bloom-rot', `${randBetween(-14, 14).toFixed(1)}deg`);
  });
}

function attachBloomFlourish(host) {
  if (!host || host.querySelector('.bloom-flourish')) return;
  host.classList.add('has-bloom-flourish');

  const blooms = document.createElement('span');
  blooms.className = 'bloom-flourish';
  blooms.setAttribute('aria-hidden', 'true');

  [
    ['bloom-flourish__item bloom-flourish__item--a', '/images/letter/rose.png?v=2'],
    ['bloom-flourish__item bloom-flourish__item--b', '/images/letter/blossom.png?v=2'],
    ['bloom-flourish__item bloom-flourish__item--vine', '/images/letter/vine-a.png?v=2'],
  ].forEach(([className, src]) => {
    const img = document.createElement('img');
    img.className = className;
    img.src = src;
    img.alt = '';
    img.width = 256;
    img.height = 256;
    blooms.append(img);
  });

  host.append(blooms);
  scrambleBloomFlourish(host);

  const restyle = () => scrambleBloomFlourish(host);
  host.addEventListener('pointerenter', restyle);
  host.addEventListener('focusin', restyle);
}

function enhanceRsvpBlooms(root = document) {
  root.querySelectorAll('.nav__rsvp-btn, a.btn[href="/rsvp"], #rsvpWelcomeStart').forEach(attachBloomFlourish);
}

function initHeroArc() {
  const ring = document.querySelector('[data-hero-arc-ring]');
  if (!ring || ring.childElementCount) return;

  const assets = [
    '/images/letter/rose.png?v=2',
    '/images/letter/blossom.png?v=2',
    '/images/letter/peony.png?v=2',
    '/images/letter/wildrose.png?v=2',
    '/images/letter/bud.png?v=2',
    '/images/letter/leaf.png?v=2',
  ];
  const sizes = [70, 46, 58, 38, 54, 42, 64, 48, 56, 36];
  const count = 52;
  const frag = document.createDocumentFragment();

  for (let i = 0; i < count; i += 1) {
    const img = document.createElement('img');
    img.className = 'hero-arc__bloom';
    img.src = assets[i % assets.length];
    img.alt = '';
    img.width = 256;
    img.height = 256;
    img.style.setProperty('--i', String((360 / count) * i));
    img.style.setProperty('--size', `${sizes[i % sizes.length]}px`);
    img.style.setProperty('--tilt', `${((i % 7) - 3) * 3}deg`);
    frag.append(img);
  }

  ring.append(frag);
}

function bindNav(nav) {
  if (!nav || nav.dataset.bound) return;
  nav.dataset.bound = 'true';
  enhanceRsvpBlooms(nav);
  const navToggle = document.getElementById('navToggle');
  const navMobile = document.getElementById('navMobile');
  if (!navToggle || !navMobile) return;

  function setMobileNav(isOpen) {
    navMobile.classList.toggle('open', isOpen);
    nav.classList.toggle('nav--open', isOpen);
    navToggle.classList.toggle('active', isOpen);
    navToggle.setAttribute('aria-expanded', String(isOpen));
    navMobile.setAttribute('aria-hidden', String(!isOpen));
    updateNav();
  }

  navToggle.addEventListener('click', () => {
    setMobileNav(!navMobile.classList.contains('open'));
  });

  document.addEventListener('pointerdown', (event) => {
    if (!navMobile.classList.contains('open')) return;
    if (event.target.closest('.nav')) return;
    event.preventDefault();
    setMobileNav(false);
    closeVenueMenus();
  });

  const desktopNav = window.matchMedia('(min-width: 810px)');
  desktopNav.addEventListener('change', (event) => {
    if (!event.matches) return;
    setMobileNav(false);
    closeVenueMenus();
  });

  function closeVenueMenus() {
    document.querySelectorAll('.nav__menu.is-open').forEach((menu) => {
      menu.classList.remove('is-open');
      menu.querySelector('.nav__menu-btn')?.setAttribute('aria-expanded', 'false');
    });
  }

  document.querySelectorAll('.nav__menu').forEach((menu) => {
    const button = menu.querySelector('.nav__menu-btn');
    if (!button) return;
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const open = !menu.classList.contains('is-open');
      closeVenueMenus();
      menu.classList.toggle('is-open', open);
      button.setAttribute('aria-expanded', String(open));
    });
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.nav__menu')) closeVenueMenus();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeVenueMenus();
  });

  navMobile.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      setMobileNav(false);
      closeVenueMenus();
    });
  });
}

function startSite() {
  mountSite();

const nav = document.getElementById('nav');
if (!nav) return;
const navMobile = document.getElementById('navMobile');
const hero = document.querySelector('.hero');
const heroCard = document.querySelector('.hero__card');
const heroImage = document.querySelector('.hero__image');

const HERO_PARALLAX_START = 80;
const HERO_PARALLAX_TRAVEL = 140;
const NAV_SHOW_AFTER = 16;
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const hasHero = Boolean(hero);
if (hasHero) nav.classList.add('nav--hero');

function updateHeroParallax() {
  if (!hero || !heroImage || prefersReducedMotion || !hero.classList.contains('is-revealed')) return;

  const heroHeight = hero.offsetHeight;
  const progress = Math.min(Math.max(lenis.scroll / heroHeight, 0), 1);
  const y = HERO_PARALLAX_START - progress * HERO_PARALLAX_TRAVEL;

  // Keep scale locked to the CSS resting size so scroll only moves, never zooms.
  heroImage.style.transform = `translate3d(0, ${y}px, 0) scale(1.08)`;
}

updateNav = function updateNav() {
  const scroll = lenis.scroll;
  const scrolled = scroll > 50;
  const mobileOpen = navMobile.classList.contains('open');

  if (!hasHero) {
    nav.classList.add('nav--scrolled');
    nav.classList.remove('nav--hidden', 'nav--hero');
    nav.inert = false;
    nav.setAttribute('aria-hidden', 'false');
    return;
  }

  nav.classList.toggle('nav--scrolled', scrolled);

  const hidden = scroll <= NAV_SHOW_AFTER && !mobileOpen;
  nav.classList.toggle('nav--hidden', hidden);
  nav.inert = hidden;
  nav.setAttribute('aria-hidden', String(hidden));

  if (hero) {
    const heroBottom = hero.offsetTop + hero.offsetHeight;
    const inHero = lenis.scroll < heroBottom - 80;
    nav.classList.toggle('nav--hero', inHero);

    if (heroCard) {
      const overImage = inHero && lenis.scroll > heroCard.offsetHeight - nav.offsetHeight;
      nav.classList.toggle('nav--over-image', overImage);
    }
  }

  updateHeroParallax();
}

lenis.on('scroll', updateNav);
updateNav();
bindNav(nav);
enhanceRsvpBlooms(document);

function injectDevNavLinks() {
  if (!import.meta.env.DEV) return;

  const path = location.pathname.replace(/\/$/, '') || '/';
  document.querySelectorAll('#navLinks, #navMobile').forEach((nav) => {
    if (nav.querySelector('[data-dev-nav="gallery"]')) return;

    const link = document.createElement('a');
    link.href = '/gallery';
    link.textContent = 'Gallery';
    link.dataset.devNav = 'gallery';
    if (path === '/gallery') link.setAttribute('aria-current', 'page');

    const rsvp = nav.querySelector('.nav__rsvp-btn, a[href="/rsvp"]');
    if (rsvp) rsvp.before(link);
    else nav.append(link);
  });
}

injectDevNavLinks();

if (import.meta.env.PROD && location.pathname.replace(/\/$/, '') === '/gallery') {
  location.replace('/');
}

// Carousels
function initCarousel(id) {
  const carousel = document.getElementById(id);
  if (!carousel) return;

  const slides = carousel.querySelectorAll('.carousel__slide');
  const prevBtn = carousel.querySelector('.carousel__btn--prev');
  const nextBtn = carousel.querySelector('.carousel__btn--next');
  let current = 0;

  function showSlide(index) {
    slides.forEach((slide, i) => {
      slide.classList.toggle('active', i === index);
    });
    current = index;
  }

  prevBtn?.addEventListener('click', () => {
    showSlide((current - 1 + slides.length) % slides.length);
  });

  nextBtn?.addEventListener('click', () => {
    showSlide((current + 1) % slides.length);
  });

  setInterval(() => {
    showSlide((current + 1) % slides.length);
  }, 5000);
}

initCarousel('weddingCarousel');
initCarousel('receptionCarousel');

function initLetterFlowers(scroll) {
  const stage = document.querySelector('.letter-stage');
  if (!stage || stage.dataset.bound === 'true') return;
  stage.dataset.bound = 'true';

  const petals = [...stage.querySelectorAll('.letter-flower, .letter-leaf, .letter-vine')].map((petal) => {
    const styles = getComputedStyle(petal);
    const depth = Number.parseFloat(styles.getPropertyValue('--parallax-depth')) || 0.35;
    const drift = Number.parseFloat(styles.getPropertyValue('--parallax-drift')) || 1;
    return { el: petal, depth, drift };
  });
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const updateParallax = () => {
    const rect = stage.getBoundingClientRect();
    const view = window.innerHeight || 1;
    const progress = (view * 0.55 - (rect.top + rect.height * 0.5)) / view;
    const clamped = Math.max(-1.15, Math.min(1.15, progress));

    petals.forEach(({ el, depth, drift }) => {
      const y = clamped * depth * 140;
      const x = clamped * depth * 48 * drift;
      const scale = 1 + clamped * depth * 0.04;
      el.style.setProperty('--parallax-x', `${x.toFixed(2)}px`);
      el.style.setProperty('--parallax-y', `${y.toFixed(2)}px`);
      el.style.setProperty('--parallax-scale', scale.toFixed(4));
    });
  };

  if (prefersReducedMotion) return;

  scroll.on('scroll', updateParallax);
  updateParallax();
}

initLetterFlowers(lenis);
initHeroArc();

// FAQ accordion
const accordion = document.getElementById('faqAccordion');
if (accordion) {
  accordion.querySelectorAll('.accordion__trigger').forEach((trigger) => {
    trigger.addEventListener('click', () => {
      const item = trigger.closest('.accordion__item');
      const isOpen = item.classList.contains('open');

      accordion.querySelectorAll('.accordion__item').forEach((el) => {
        el.classList.remove('open');
        el.querySelector('.accordion__trigger').setAttribute('aria-expanded', 'false');
      });

      if (!isOpen) {
        item.classList.add('open');
        trigger.setAttribute('aria-expanded', 'true');
      }
    });
  });
}

// RSVP check-in
initWeddingContent();
initRsvp(lenis);

// Smooth scroll for same-page anchors, including root-relative `/#section` links.
document.querySelectorAll('a[href*="#"]').forEach((anchor) => {
  anchor.addEventListener('click', (e) => {
    const href = anchor.getAttribute('href');
    if (!href) return;

    const hashIndex = href.indexOf('#');
    const hash = href.slice(hashIndex);
    if (!hash || hash === '#') return;

    const path = href.slice(0, hashIndex);
    const samePage = !path || path === '/';
    if (!samePage) return;

    const target = document.querySelector(hash);
    if (!target) return;

    e.preventDefault();
    if (location.hash !== hash) history.pushState(null, '', hash);
    lenis.scrollTo(target, {
      offset: -nav.offsetHeight,
      duration: 1.4,
    });
  });
});

lenis.start();
}

bindNav(document.getElementById('nav'));
initSiteGate(lenis, startSite).then(() => updateNav());
