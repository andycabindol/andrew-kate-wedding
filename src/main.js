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

function bindNav(nav) {
  if (!nav || nav.dataset.bound) return;
  nav.dataset.bound = 'true';
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
  const flowers = document.querySelector('.letter-flowers');
  const card = document.querySelector('.letter-stack');
  if (!stage || !flowers || !card || flowers.dataset.bound === 'true') return;
  flowers.dataset.bound = 'true';

  const petals = [...flowers.querySelectorAll('.letter-flower, .letter-leaf')].map((petal) => {
    const styles = getComputedStyle(petal);
    const depth = Number.parseFloat(styles.getPropertyValue('--parallax-depth')) || 0.35;
    const drift = Number.parseFloat(styles.getPropertyValue('--parallax-drift')) || 1;
    return {
      el: petal,
      depth,
      drift,
      revealX: 0,
      revealY: 0,
      revealScale: 1,
      revealOpacity: 0,
    };
  });
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let revealing = false;

  const easeOut = (t) => 1 - Math.pow(1 - t, 3);

  const paintPetal = (petal) => {
    const { el, revealX, revealY, revealScale, revealOpacity } = petal;
    el.style.setProperty('--reveal-x', `${revealX.toFixed(2)}px`);
    el.style.setProperty('--reveal-y', `${revealY.toFixed(2)}px`);
    el.style.setProperty('--reveal-scale', revealScale.toFixed(4));
    el.style.opacity = String(revealOpacity);
  };

  const updateParallax = () => {
    if (!flowers.classList.contains('is-parallaxing')) return;
    const rect = stage.getBoundingClientRect();
    const view = window.innerHeight || 1;
    const progress = (view * 0.55 - (rect.top + rect.height * 0.5)) / view;
    const clamped = Math.max(-1.15, Math.min(1.15, progress));

    petals.forEach((petal) => {
      const { el, depth, drift } = petal;
      const y = clamped * depth * 140;
      const x = clamped * depth * 48 * drift;
      const scale = 1 + clamped * depth * 0.04;
      el.style.setProperty('--parallax-x', `${x.toFixed(2)}px`);
      el.style.setProperty('--parallax-y', `${y.toFixed(2)}px`);
      el.style.setProperty('--parallax-scale', scale.toFixed(4));
      // Never set style.transform — CSS composes parallax + reveal.
      paintPetal(petal);
    });
  };

  const reveal = () => {
    if (flowers.classList.contains('is-revealed') || revealing) return;
    revealing = true;
    flowers.classList.add('is-revealed');

    if (prefersReducedMotion) {
      flowers.classList.add('is-static', 'is-parallaxing');
      petals.forEach((petal) => {
        petal.revealX = 0;
        petal.revealY = 0;
        petal.revealScale = 1;
        petal.revealOpacity = 1;
        paintPetal(petal);
      });
      revealing = false;
      updateParallax();
      return;
    }

    const origin = card.getBoundingClientRect();
    const ox = origin.left + origin.width / 2;
    const oy = origin.top + origin.height / 2;
    const duration = 900;
    const stagger = 28;
    const start = performance.now();

    petals.forEach((petal) => {
      const rect = petal.el.getBoundingClientRect();
      const px = rect.left + rect.width / 2;
      const py = rect.top + rect.height / 2;
      petal.fromX = (ox - px) * 0.28;
      petal.fromY = (oy - py) * 0.28;
      petal.revealX = petal.fromX;
      petal.revealY = petal.fromY;
      petal.revealScale = 0.55;
      petal.revealOpacity = 0;
      paintPetal(petal);
    });

    // Parallax runs during reveal; CSS composes both layers.
    flowers.classList.add('is-parallaxing');
    updateParallax();

    const tick = (now) => {
      let allDone = true;

      petals.forEach((petal, index) => {
        const local = (now - start - index * stagger) / duration;
        if (local < 1) allDone = false;
        const t = easeOut(Math.max(0, Math.min(1, local)));
        petal.revealX = petal.fromX * (1 - t);
        petal.revealY = petal.fromY * (1 - t);
        petal.revealScale = 0.55 + 0.45 * t;
        petal.revealOpacity = t;
      });

      updateParallax();

      if (!allDone) {
        requestAnimationFrame(tick);
        return;
      }

      petals.forEach((petal) => {
        petal.revealX = 0;
        petal.revealY = 0;
        petal.revealScale = 1;
        petal.revealOpacity = 1;
        paintPetal(petal);
      });
      revealing = false;
      updateParallax();
    };

    requestAnimationFrame(tick);
  };

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        reveal();
        observer.disconnect();
      });
    },
    { threshold: 0.3, rootMargin: '0px 0px -6% 0px' },
  );
  observer.observe(stage);

  if (prefersReducedMotion) {
    reveal();
    return;
  }

  scroll.on('scroll', updateParallax);
  updateParallax();
}

initLetterFlowers(lenis);

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
