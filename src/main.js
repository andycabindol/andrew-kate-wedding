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
const NAV_HIDE_AFTER = 120;
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

nav.classList.add('nav--hero');

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
  nav.classList.toggle('nav--scrolled', scrolled);

  const mobileOpen = navMobile.classList.contains('open');

  if (!prefersReducedMotion) {
    if (scroll <= NAV_HIDE_AFTER || mobileOpen) {
      nav.classList.remove('nav--hidden');
    } else if (lenis.direction < 0) {
      nav.classList.remove('nav--hidden');
    } else if (lenis.direction > 0) {
      nav.classList.add('nav--hidden');
    }
  } else {
    nav.classList.remove('nav--hidden');
  }

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

  if (isOpen) {
    nav.classList.remove('nav--hidden');
  }
});

navMobile.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => {
    navMobile.classList.remove('open');
    navToggle.classList.remove('active');
    navToggle.setAttribute('aria-expanded', 'false');
    navMobile.setAttribute('aria-hidden', 'true');
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

// Smooth scroll for anchor links
document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
  anchor.addEventListener('click', (e) => {
    const href = anchor.getAttribute('href');
    if (!href || href === '#') return;

    const target = document.querySelector(href);
    if (!target) return;

    e.preventDefault();
    lenis.scrollTo(target, {
      offset: -nav.offsetHeight,
      duration: 1.4,
    });
  });
});
