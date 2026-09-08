import Lenis from 'lenis';
import 'lenis/dist/lenis.css';
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

// Navigation scroll effect
const nav = document.getElementById('nav');
const navToggle = document.getElementById('navToggle');
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
  if (!hero || !heroImage || prefersReducedMotion) return;

  const heroHeight = hero.offsetHeight;
  const progress = Math.min(Math.max(lenis.scroll / heroHeight, 0), 1);
  const y = HERO_PARALLAX_START - progress * HERO_PARALLAX_TRAVEL;

  heroImage.style.transform = `translate3d(0, ${y}px, 0) scale(1.08)`;
}

function updateNav() {
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

// Mobile menu toggle
navToggle.addEventListener('click', () => {
  const isOpen = navMobile.classList.toggle('open');
  navToggle.classList.toggle('active', isOpen);
  navToggle.setAttribute('aria-expanded', isOpen);
  navMobile.setAttribute('aria-hidden', !isOpen);

  updateNav();
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
    navMobile.classList.remove('open');
    navToggle.classList.remove('active');
    navToggle.setAttribute('aria-expanded', 'false');
    navMobile.setAttribute('aria-hidden', 'true');
    closeVenueMenus();
    updateNav();
  });
});

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
initRsvp();

// Smooth scroll for same-page anchors, including root-relative `/#section` links.
document.querySelectorAll('a[href^="#"], a[href^="/#"]').forEach((anchor) => {
  anchor.addEventListener('click', (e) => {
    const href = anchor.getAttribute('href');
    if (!href || href === '#' || href === '/#') return;

    const hash = href.startsWith('/#') ? href.slice(1) : href;
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
