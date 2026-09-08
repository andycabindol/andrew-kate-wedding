const SESSION_KEY = 'ka-session';
const INTRO_KEY = 'ka-intro';
const PASSWORD_HASH = '5313e5bf17148de844ff74be3663d47c6e361ca469b30a36337701233c89a15e';

function shouldReplay() {
  return new URLSearchParams(window.location.search).has('gate');
}

function hasSession() {
  try {
    if (shouldReplay()) {
      sessionStorage.removeItem(SESSION_KEY);
      return false;
    }
    return sessionStorage.getItem(SESSION_KEY) === PASSWORD_HASH;
  } catch {
    return false;
  }
}

function rememberSession() {
  sessionStorage.setItem(SESSION_KEY, PASSWORD_HASH);
}

function shouldPlayIntro() {
  try {
    if (shouldReplay()) {
      sessionStorage.removeItem(INTRO_KEY);
      return true;
    }
    return sessionStorage.getItem(INTRO_KEY) !== '1';
  } catch {
    return true;
  }
}

function rememberIntro() {
  sessionStorage.setItem(INTRO_KEY, '1');
}

function bindPeekPassword(input) {
  let secret = '';
  const paint = () => {
    input.value = secret ? `${'•'.repeat(secret.length - 1)}${secret.slice(-1)}` : '';
  };

  input.addEventListener('beforeinput', (event) => {
    if (event.inputType === 'insertText' && event.data) {
      event.preventDefault();
      const replacing = input.selectionStart === 0 && input.selectionEnd === input.value.length && input.value.length > 0;
      secret = (replacing ? event.data : secret + event.data).slice(0, 12);
      paint();
      return;
    }
    if (event.inputType === 'deleteContentBackward') {
      event.preventDefault();
      const replacing = input.selectionStart === 0 && input.selectionEnd === input.value.length && input.value.length > 0;
      secret = replacing ? '' : secret.slice(0, -1);
      paint();
      return;
    }
    if (event.inputType.startsWith('delete')) {
      event.preventDefault();
      secret = '';
      paint();
    }
  });

  input.addEventListener('paste', (event) => {
    event.preventDefault();
    const text = (event.clipboardData?.getData('text') || '').replace(/\s/g, '');
    secret = (secret + text).slice(0, 12);
    paint();
  });

  return () => secret;
}

async function digest(value) {
  const data = new TextEncoder().encode(value);
  const buffer = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function sameHash(left, right) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i += 1) mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return mismatch === 0;
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
}

function playMeet(gate) {
  const katie = gate.querySelector('.site-gate__name--katie');
  const andrew = gate.querySelector('.site-gate__name--andrew');
  const mark = gate.querySelector('.site-gate__mark');
  const percent = gate.querySelector('.site-gate__percent');
  const fill = gate.querySelector('.site-gate__fill');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const duration = reduced ? 420 : 2400;

  katie.style.transform = 'none';
  andrew.style.transform = 'none';

  return new Promise((resolve) => {
    const started = performance.now();
    const katieHome = katie.getBoundingClientRect();
    const andrewHome = andrew.getBoundingClientRect();
    const markHome = mark.getBoundingClientRect();
    const gap = 16;
    const katieDistance = Math.max(0, markHome.left - gap - katieHome.right);
    const andrewDistance = Math.max(0, andrewHome.left - markHome.right - gap);

    function frame(now) {
      const t = Math.min(1, (now - started) / duration);
      const eased = easeInOut(t);
      const value = Math.round(eased * 100);

      percent.textContent = `${value}%`;
      fill.style.transform = `scaleX(${eased})`;
      katie.style.transform = `translate3d(${katieDistance * eased}px, 0, 0)`;
      andrew.style.transform = `translate3d(${-andrewDistance * eased}px, 0, 0)`;

      if (t < 1) {
        requestAnimationFrame(frame);
        return;
      }

      percent.textContent = '100%';
      window.setTimeout(resolve, reduced ? 40 : 80);
    }

    requestAnimationFrame(frame);
  });
}

function dismiss(gate) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.querySelectorAll('header, main, footer').forEach((el) => {
    el.inert = false;
  });
  document.documentElement.classList.remove('is-locked', 'is-intro');

  if (reduced) {
    document.documentElement.classList.add('is-unlocked');
    gate.remove();
    return Promise.resolve();
  }

  gate.classList.add('is-leaving');
  return new Promise((resolve) => {
    window.setTimeout(() => {
      document.documentElement.classList.add('is-unlocked');
      gate.remove();
      resolve();
    }, 760);
  });
}

export function revealHero() {
  const hero = document.querySelector('.hero');
  if (!hero || hero.classList.contains('is-revealed')) return Promise.resolve();

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) {
    hero.classList.add('is-revealed');
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      hero.classList.add('is-revealed');
      resolve();
    });
  });
}

function mountLockedSite(onReady) {
  onReady?.();
}

function playIntro(intro, lenis, onReady) {
  lenis?.stop();
  intro.querySelector('.site-gate__load')?.classList.add('is-on');
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      playMeet(intro).then(async () => {
        rememberIntro();
        mountLockedSite(onReady);
        lenis?.start();
        await dismiss(intro);
        await revealHero();
        resolve();
      });
    });
  });
}

export function initSiteGate(lenis, onReady) {
  const gate = document.getElementById('siteGate');
  if (!gate) {
    const intro = document.getElementById('siteIntro');
    if (intro && shouldPlayIntro()) {
      document.documentElement.classList.add('is-intro');
      return playIntro(intro, lenis, onReady);
    }
    intro?.remove();
    mountLockedSite(onReady);
    revealHero();
    return Promise.resolve();
  }

  if (hasSession()) {
    gate.remove();
    document.documentElement.classList.remove('is-locked');
    document.documentElement.classList.add('is-unlocked');
    mountLockedSite(onReady);
    return revealHero();
  }

  document.documentElement.classList.add('is-locked');
  lenis?.stop();

  const form = gate.querySelector('.site-gate__form');
  const input = gate.querySelector('.site-gate__input');
  const error = gate.querySelector('.site-gate__error');
  const enter = gate.querySelector('.site-gate__enter');
  const password = bindPeekPassword(input);

  requestAnimationFrame(() => gate.classList.add('is-ready'));
  window.setTimeout(() => input?.focus(), 480);

  return new Promise((resolve) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const hash = await digest(password().trim());
      if (!sameHash(hash, PASSWORD_HASH)) {
        error.hidden = false;
        input.setAttribute('aria-invalid', 'true');
        form.classList.remove('is-wrong');
        void form.offsetWidth;
        form.classList.add('is-wrong');
        input.select();
        return;
      }

      error.hidden = true;
      input.setAttribute('aria-invalid', 'false');
      form.querySelector('button').disabled = true;
      rememberSession();
      mountLockedSite(onReady);
      enter.classList.add('is-done');
      await new Promise((done) => window.setTimeout(done, 280));
      lenis?.start();
      await dismiss(gate);
      resolve();
    });
  });
}
