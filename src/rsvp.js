import { weddingConfig } from './wedding-config.js';
import { highlightUnmatched, suggestGuests } from '../supabase/functions/wedding-rsvp/matching.js';

export function initRsvp(lenis) {
  if (!document.getElementById('rsvp')) return;
  const byId = (id) => document.getElementById(id);
  const searchForm = byId('rsvpLookupForm');
  const input = byId('guestSearch');
  const results = byId('guestResults');
  const form = byId('rsvpForm');
  const members = byId('partyMembers');
  const status = byId('rsvpStatus');
  const submit = byId('rsvpSubmit');
  let selectedParty = null;
  let savedReply = null;
  let guestList = [];
  let activeSuggestion = -1;
  let busy = false;
  const pageQuery = new URLSearchParams(location.search);
  const inviteMode = Boolean(invitePartyId());

  function slugId(value) {
    return String(value || '').normalize('NFKD').replace(/\p{M}/gu, '')
      .toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
  }

  function invitePartyId() {
    return (pageQuery.get('party') || pageQuery.get('invite') || '').trim();
  }

  function showStep(step) {
    const screen = step === 'confirm' || step === 'already' ? 'search' : step;
    ['Loading', 'Pending', 'Search', 'Success', 'Unavailable', 'Missing'].forEach((name) => {
      const el = byId(`rsvp${name}Step`);
      if (el) el.hidden = name.toLowerCase() !== screen;
    });
    const story = byId('rsvpStory');
    if (story) story.hidden = screen !== 'search';
    const back = byId('rsvpBack');
    if (back && screen !== 'search') back.hidden = true;
    status.textContent = '';
  }

  function setStepOpen(block, open) {
    block.classList.toggle('is-open', open);
  }

  let slideIndex = 0;

  function slideTo(index, { animate = true } = {}) {
    const viewport = byId('rsvpSlide');
    const track = byId('rsvpSlideTrack');
    if (!viewport || !track) return;
    const panes = [...track.querySelectorAll('.rsvp-card__pane')];
    const pane = panes[index];
    if (!pane) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const shouldAnimate = animate && !reduced && index !== slideIndex;
    const width = viewport.clientWidth;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      panes.forEach((item, paneIndex) => {
        const active = paneIndex === index;
        item.classList.toggle('is-active', active);
        item.toggleAttribute('inert', !active);
      });
      viewport.style.overflow = index === 0 ? 'visible' : 'hidden';
      viewport.style.transition = 'none';
    };
    panes.forEach((item) => { item.style.flexBasis = `${width}px`; });
    panes.forEach((item, paneIndex) => {
      const showing = paneIndex === index || (shouldAnimate && paneIndex === slideIndex);
      item.classList.toggle('is-active', showing);
      if (paneIndex === index) item.removeAttribute('inert');
    });
    viewport.style.overflow = 'hidden';
    if (!shouldAnimate) {
      track.style.transition = 'none';
      viewport.style.transition = 'none';
    } else {
      track.style.transition = 'transform 0.55s cubic-bezier(0.77, 0, 0.18, 1)';
      viewport.style.transition = 'height 0.55s cubic-bezier(0.77, 0, 0.18, 1)';
    }
    track.style.transform = `translate3d(-${index * width}px, 0, 0)`;
    viewport.style.height = `${pane.offsetHeight}px`;
    slideIndex = index;
    if (!shouldAnimate) {
      viewport.offsetHeight;
      track.style.transition = '';
      viewport.style.transition = '';
      finish();
      return;
    }
    track.addEventListener('transitionend', (event) => {
      if (event.target !== track || event.propertyName !== 'transform') return;
      finish();
    }, { once: true });
    window.setTimeout(finish, 700);
  }

  let currentStage = 'find';
  let confirmStage = 'confirm';

  function openReached(stage, { scroll = true, animate = true } = {}) {
    currentStage = stage;
    if (stage === 'confirm' || stage === 'already') confirmStage = stage;
    const confirmBody = byId('rsvpConfirmBody');
    const alreadyBody = byId('rsvpAlreadyBody');
    const noteBody = byId('rsvpNoteBody');
    setStepOpen(byId('rsvpFindBlock'), stage === 'find');
    setStepOpen(byId('rsvpConfirmBlock'), stage === 'confirm' || stage === 'already');
    setStepOpen(byId('rsvpNoteBlock'), stage === 'note');
    if (stage === 'confirm' || stage === 'already') {
      confirmBody.hidden = stage !== 'confirm';
      alreadyBody.hidden = stage !== 'already';
    }
    if (stage === 'note') noteBody.hidden = false;
    const order = { find: 0, confirm: 1, already: 1, note: 2 };
    const here = order[stage];
    const storySteps = [
      [byId('rsvpFindHeading'), 0, 'find'],
      [byId('rsvpConfirmHeading'), 1, confirmStage],
      [byId('rsvpWishesHeading'), 2, 'note'],
    ];
    storySteps.forEach(([heading, index, next]) => {
      if (!heading) return;
      const canGoBack = index < here && (index === 0 || selectedParty);
      heading.classList.toggle('is-current', index === here);
      heading.classList.toggle('is-done', canGoBack);
      heading.classList.toggle('is-ahead', index > here);
      heading.setAttribute('aria-current', index === here ? 'step' : 'false');
      heading.onclick = canGoBack ? () => openReached(next) : null;
    });
    const back = byId('rsvpBack');
    if (back) {
      const previous = here > 1 && selectedParty ? confirmStage : here > 0 ? 'find' : null;
      back.hidden = !previous;
      back.onclick = previous ? () => openReached(previous) : null;
    }
    byId('rsvpCard')?.classList.toggle('is-stepped', here > 0);
    if (here !== 0) hideSuggestions();
    slideTo(here, { animate });
    if (!scroll) return;
    const targets = {
      find: byId('rsvpFindBlock'),
      confirm: byId('rsvpConfirmBlock'),
      already: byId('rsvpAlreadyBody'),
      note: byId('rsvpNoteBlock'),
    };
    scrollToStep(targets[stage]);
  }
  const focus = (el) => el.focus({ preventScroll: true });

  function scrollToStep(el, onDone) {
    if (!el) {
      onDone?.();
      return;
    }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const navHeight = document.getElementById('nav')?.offsetHeight || 0;
    const box = el.getBoundingClientRect();
    if (box.top >= navHeight + 12 && box.bottom <= window.innerHeight - 16) {
      onDone?.();
      return;
    }
    const run = () => {
      const nav = document.getElementById('nav');
      const offset = -((nav?.offsetHeight || 0) + 20);
      let finished = false;
      const done = () => {
        if (finished) return;
        finished = true;
        onDone?.();
      };
      if (lenis?.scrollTo) {
        lenis.resize?.();
        lenis.scrollTo(el, {
          offset,
          duration: reduced ? 0 : 0.75,
          immediate: reduced,
          force: true,
          lock: true,
          onComplete: done,
        });
        if (onDone) window.setTimeout(done, reduced ? 0 : 900);
        return;
      }
      const top = window.scrollY + el.getBoundingClientRect().top + offset;
      window.scrollTo({ top: Math.max(0, top), behavior: reduced ? 'auto' : 'smooth' });
      if (onDone) window.setTimeout(done, reduced ? 0 : 750);
    };
    requestAnimationFrame(() => requestAnimationFrame(run));
  }

  async function loadGuestList() {
    if (!weddingConfig.rsvpEndpoint) throw new Error('Guest list is not configured');
    const data = await request({ action: 'list' });
    guestList = Array.isArray(data.parties) ? data.parties : [];
    return guestList;
  }

  function rememberSavedParty(party, responses, wishes) {
    const saved = {
      ...party,
      replied: true,
      wishes,
      members: party.members.map((member, index) => {
        const answer = responses[index] || {};
        const named = typeof answer.name === 'string' ? answer.name.trim() : '';
        return {
          ...member,
          attending: answer.attending,
          ...(member.plusOne && named ? { name: named } : {}),
        };
      }),
    };
    guestList = guestList.map((item) => item.id === party.id ? { ...saved, token: item.token } : item);
    return saved;
  }

  function attendanceLine(members) {
    const attending = members.filter((member) => member.attending === true).length;
    const noun = members.length === 1 ? 'guest' : 'guests';
    return `${attending} of ${members.length} ${noun} ${attending === 1 ? 'is' : 'are'} attending.`;
  }

  function phosphorIcon(path) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 256 256');
    svg.setAttribute('aria-hidden', 'true');
    const shape = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    shape.setAttribute('fill', 'currentColor');
    shape.setAttribute('d', path);
    svg.append(shape);
    return svg;
  }

  function summaryItems(party, responses = party.members) {
    return responses.map((response, index) => {
      const attending = response.attending === true;
      const unable = response.attending === false;
      const row = document.createElement('li');
      if (attending) row.className = 'is-attending';
      if (unable) row.className = 'is-unable';
      const name = document.createElement('span');
      name.className = 'rsvp-summary__name';
      name.textContent = response.name || party.members[index]?.name || 'Guest';
      const answer = document.createElement('span');
      const mark = document.createElement('span');
      mark.className = 'rsvp-summary__mark';
      mark.setAttribute('aria-hidden', 'true');
      if (attending) mark.append(phosphorIcon('M228.24,76.24l-128,128a6,6,0,0,1-8.48,0l-56-56a6,6,0,0,1,8.48-8.48L96,191.51,219.76,67.76a6,6,0,0,1,8.48,8.48Z'));
      if (unable) mark.append(phosphorIcon('M204.24,195.76a6,6,0,0,1-8.48,8.48L128,136.49,60.24,204.24a6,6,0,0,1-8.48-8.48L119.51,128,51.76,60.24a6,6,0,0,1,8.48-8.48L128,119.51l67.76-67.75a6,6,0,0,1,8.48,8.48L136.49,128Z'));
      const label = document.createElement('span');
      label.textContent = attending ? 'Attending' : unable ? 'Unable to attend' : 'No response';
      answer.append(mark, label);
      row.append(name, answer);
      return row;
    });
  }

  function showAlready(party) {
    byId('rsvpAlreadyParty').textContent = party.label;
    byId('rsvpAlreadyCount').textContent = attendanceLine(party.members);
    byId('rsvpAlreadySummary').replaceChildren(...summaryItems(party));
    showStep('already');
    openReached('already', { animate: false });
    focus(byId('rsvpAlreadyHeading'));
  }

  function openInvitation(party, { animate = true } = {}) {
    if (party.replied) showAlready(party);
    else selectParty(party, { animate });
  }

  function chooseParty(party, mode) {
    if (mode === 'edit') selectParty(party);
    else openInvitation(party);
    const opening = openParty(party).then((opened) => {
      if (selectedParty?.id !== party.id) return opened;
      selectedParty.token = opened.token;
      selectedParty.opening = opening;
      if (mode === 'edit' && opened.replied && form.dataset.dirty !== '1') {
        selectParty({ ...opened, token: opened.token, opening }, { animate: false });
      }
      return opened;
    }).catch((error) => {
      if (selectedParty?.id === party.id) status.textContent = errorMessage(error);
      throw error;
    });
    if (selectedParty?.id === party.id) selectedParty.opening = opening;
  }

  async function openParty(party) {
    const data = await request({ action: 'open', id: party.id });
    return { ...data.party, token: data.token };
  }

  async function request(body) {
    const response = await fetch(weddingConfig.rsvpEndpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
    });
    const data = await response.json();
    if (!response.ok) {
      const error = new Error(data.error || 'Something went wrong. Please try again.');
      error.status = response.status;
      throw error;
    }
    return data;
  }
  const errorMessage = (error) => error.status ? error.message
    : 'We couldn’t connect. Please check your connection and try again.';

  let invitedParty = null;

  function applyInviteChrome(party) {
    document.getElementById('rsvp')?.classList.add('rsvp--invite');
    invitedParty = party;
    const title = byId('rsvpTitle');
    if (title) title.textContent = `Hi ${party.label}`;
    const welcomeLabel = byId('rsvpFindHeading')?.querySelector('.rsvp-story__label');
    if (welcomeLabel) welcomeLabel.textContent = 'Welcome';
    byId('rsvpWelcome').hidden = false;
    byId('rsvpHelp').hidden = true;
    searchForm.hidden = true;
    openReached('find', { scroll: false, animate: false });
  }

  function selectParty(party, { animate = true } = {}) {
    const opening = party.opening || (selectedParty?.id === party.id ? selectedParty.opening : null);
    selectedParty = opening ? { ...party, opening } : party;
    form.dataset.dirty = '';
    form.reset();
    members.replaceChildren();
    const heading = byId('partyHeading');
    const intro = heading.nextElementSibling;
    const namedGuests = party.members.filter((member) => !member.plusOne);
    const several = namedGuests.length > 1;
    const hasPlusOne = party.members.some((member) => member.plusOne);
    const first = (namedGuests[0] || party.members[0]).name.trim().split(/\s+/)[0];
    heading.textContent = inviteMode ? party.label : `${first}${/s$/i.test(first) ? '’' : '’s'} Party`;
    heading.hidden = inviteMode || !several;
    intro.textContent = hasPlusOne
      ? 'Please reply for everyone on this invitation, including any plus one.'
      : 'Please reply for everyone on this invitation.';
    intro.hidden = !several && !hasPlusOne;
    party.members.forEach((member, index) => {
      const fieldset = document.createElement('fieldset');
      fieldset.className = 'party-member';
      const row = document.createElement('div');
      row.className = 'party-member__row';
      const name = document.createElement('span');
      name.id = `party-member-name-${index}`;
      name.className = 'party-member__name';
      name.textContent = member.name;
      fieldset.setAttribute('aria-labelledby', name.id);
      const choices = document.createElement('div');
      choices.className = 'party-member__choices';
      [['yes', 'Attending'], ['no', 'Unable to attend']].forEach(([value, text]) => {
        const label = document.createElement('label');
        label.className = 'party-member__choice';
        const radio = document.createElement('input');
        Object.assign(radio, { type: 'radio', name: `attending-${index}`, value, required: true });
        if ((value === 'yes' && member.attending === true) || (value === 'no' && member.attending === false)) radio.checked = true;
        const caption = document.createElement('span');
        caption.textContent = text;
        label.append(radio, caption);
        choices.append(label);
      });
      row.append(name, choices);
      fieldset.append(row);
      if (member.plusOne) {
        const guestFields = document.createElement('div');
        guestFields.className = 'party-member__guest';
        guestFields.hidden = true;
        const nameLabel = document.createElement('label');
        nameLabel.className = 'party-member__guest-name';
        nameLabel.htmlFor = `guest-name-${index}`;
        nameLabel.textContent = 'Guest’s name';
        const nameInput = document.createElement('input');
        nameInput.id = `guest-name-${index}`;
        Object.assign(nameInput, { type: 'text', name: `guest-name-${index}`, maxLength: 80, autocomplete: 'name', placeholder: 'First and Last name' });
        nameInput.addEventListener('input', () => { nameInput.setCustomValidity(''); });
        const savedName = String(member.name || '').trim();
        if (member.attending === true && savedName && !/^plus one( \d+)?$/i.test(savedName)) {
          guestFields.hidden = false;
          nameInput.value = savedName;
        }
        choices.addEventListener('change', () => {
          const attending = choices.querySelector('input:checked')?.value === 'yes';
          guestFields.hidden = !attending;
          if (!attending) {
            nameInput.value = '';
            nameInput.setCustomValidity('');
          }
        });
        guestFields.append(nameLabel, nameInput);
        fieldset.append(guestFields);
      }
      members.append(fieldset);
    });
    if (party.wishes) byId('wishes').value = party.wishes;
    showStep('confirm');
    openReached('confirm', { animate });
    if (several) focus(heading);
  }

  function confirmationMessage(anyoneAttending) {
    return anyoneAttending
      ? { title: 'RSVP confirmed!', detail: 'We can’t wait to share the day with you.' }
      : { title: 'We’ll miss you.', detail: 'Thank you for letting us know.' };
  }

  function celebrate() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const mark = document.querySelector('#rsvpSuccessStep .rsvp-success-mark');
    if (!mark) return;
    const canvas = document.createElement('canvas');
    canvas.className = 'rsvp-confetti';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.append(canvas);
    const context = canvas.getContext('2d');
    const colors = ['#2f7d4a', '#c4a574', '#e7d3bf', '#f4efe6', '#d9a3a0'];
    const box = mark.getBoundingClientRect();
    const originX = box.left + box.width / 2;
    const originY = box.top + box.height / 2;
    const total = 160;
    const spawnFor = 1800;
    const duration = 5200;
    const pieces = [];
    let spawned = 0;
    const spawnPiece = () => {
      const angle = Math.random() * Math.PI * 2;
      const speed = 3.2 + Math.random() * 7.5;
      return {
        x: originX + (Math.random() - 0.5) * 28,
        y: originY + (Math.random() - 0.5) * 12,
        w: 5 + Math.random() * 5,
        h: 7 + Math.random() * 7,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 3.2,
        spin: Math.random() * Math.PI,
        spinV: -0.22 + Math.random() * 0.44,
        color: colors[Math.floor(Math.random() * colors.length)],
      };
    };
    const started = performance.now();
    const draw = (now) => {
      const elapsed = now - started;
      const due = Math.min(total, Math.floor((Math.min(elapsed, spawnFor) / spawnFor) * total));
      while (spawned < due) {
        pieces.push(spawnPiece());
        spawned += 1;
      }
      const width = canvas.width = window.innerWidth;
      const height = canvas.height = window.innerHeight;
      context.clearRect(0, 0, width, height);
      pieces.forEach((piece) => {
        piece.vy += 0.07;
        piece.x += piece.vx;
        piece.y += piece.vy;
        piece.vx *= 0.992;
        piece.spin += piece.spinV;
        context.save();
        context.translate(piece.x, piece.y);
        context.rotate(piece.spin);
        context.fillStyle = piece.color;
        context.fillRect(-piece.w / 2, -piece.h / 2, piece.w, piece.h);
        context.restore();
      });
      if (elapsed < duration) requestAnimationFrame(draw);
      else canvas.remove();
    };
    requestAnimationFrame(draw);
  }

  function hideSuggestions() {
    results.replaceChildren();
    results.hidden = true;
    activeSuggestion = -1;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }

  function highlightName(container, name, query) {
    const parts = highlightUnmatched(name, query) || [{ text: name, unmatched: true }];
    container.replaceChildren(...parts.map((part) => {
      if (!part.unmatched) return document.createTextNode(part.text);
      const unmatched = document.createElement('strong');
      unmatched.textContent = part.text;
      return unmatched;
    }));
  }

  function renderSuggestions() {
    const query = input.value.trim();
    const suggestions = suggestGuests(query, guestList);
    results.replaceChildren();
    activeSuggestion = -1;
    if (!query || !suggestions.length) {
      hideSuggestions();
      return;
    }
    suggestions.forEach((suggestion, index) => {
      const li = document.createElement('li');
      const option = document.createElement('button');
      option.type = 'button';
      option.id = `guestSuggestion-${index}`;
      option.className = 'guest-results__item';
      option.setAttribute('role', 'option');
      const party = guestList.find((item) => item.id === suggestion.partyId);
      const name = document.createElement('span');
      name.className = 'guest-results__name';
      highlightName(name, suggestion.name, query);
      const status = document.createElement('span');
      if (party?.replied) {
        option.classList.add('is-replied');
        status.className = 'guest-results__status';
        const saved = document.createElement('span');
        saved.className = 'guest-results__rsvp';
        saved.textContent = 'Already RSVP’d';
        const edit = document.createElement('span');
        edit.className = 'guest-results__edit';
        edit.textContent = 'Edit RSVP';
        status.append(saved, edit);
      } else {
        status.className = 'guest-results__arrow';
        status.setAttribute('aria-hidden', 'true');
        status.append(phosphorIcon('M220.24,132.24l-72,72a6,6,0,0,1-8.48-8.48L201.51,134H40a6,6,0,0,1,0-12H201.51L139.76,60.24a6,6,0,0,1,8.48-8.48l72,72A6,6,0,0,1,220.24,132.24Z'));
      }
      option.append(name, status);
      option.addEventListener('mousedown', (event) => { event.preventDefault(); });
      option.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!party || busy) return;
        hideSuggestions();
        chooseParty(party, party.replied ? 'edit' : 'open');
      });
      li.append(option);
      results.append(li);
    });
    results.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }

  function setActiveSuggestion(index) {
    const options = [...results.querySelectorAll('button')];
    if (!options.length) return;
    activeSuggestion = (index + options.length) % options.length;
    options.forEach((option, optionIndex) => {
      option.classList.toggle('is-active', optionIndex === activeSuggestion);
      option.setAttribute('aria-selected', optionIndex === activeSuggestion ? 'true' : 'false');
    });
    input.setAttribute('aria-activedescendant', options[activeSuggestion].id);
    options[activeSuggestion].scrollIntoView({ block: 'nearest' });
  }

  function reset() {
    selectedParty = null;
    form.reset();
    hideSuggestions();
    input.value = '';
    openReached('find');
    showStep('search');
    focus(input);
  }

  function backToSearch() {
    selectedParty = null;
    form.reset();
    openReached('find');
    showStep('search');
    renderSuggestions();
    focus(input);
  }

  function setLookupReady(ready) {
    input.readOnly = !ready;
    input.setAttribute('aria-disabled', ready ? 'false' : 'true');
    input.setAttribute('aria-busy', ready ? 'false' : 'true');
  }

  function beginInviteWelcome() {
    document.getElementById('rsvp')?.classList.add('rsvp--invite');
    const welcomeLabel = byId('rsvpFindHeading')?.querySelector('.rsvp-story__label');
    if (welcomeLabel) welcomeLabel.textContent = 'Welcome';
    const title = byId('rsvpTitle');
    if (title && title.textContent === 'Confirm your RSVP') title.textContent = 'Welcome';
    byId('rsvpWelcome').hidden = false;
    byId('rsvpHelp').hidden = true;
    searchForm.hidden = true;
  }

  async function loadStatus() {
    if (inviteMode) beginInviteWelcome();
    showStep('search');
    openReached('find', { scroll: false });
    setLookupReady(false);
    try {
      const parties = await loadGuestList();
      if (!parties.length) {
        showStep('pending');
        return;
      }
      const invitedId = slugId(invitePartyId());
      if (invitedId) {
        const party = parties.find((item) => item.id === invitedId);
        if (!party) {
          showStep('missing');
          return;
        }
        applyInviteChrome(party);
        return;
      }
      showStep('search');
      openReached('find', { scroll: false });
      setLookupReady(true);
      renderSuggestions();
    } catch {
      showStep('unavailable');
    }
  }

  searchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const suggestion = results.querySelector('button');
    if (suggestion) suggestion.click();
  });

  input.addEventListener('input', () => {
    status.textContent = '';
    renderSuggestions();
  });
  input.addEventListener('keydown', (event) => {
    if (results.hidden) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveSuggestion(activeSuggestion + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveSuggestion(activeSuggestion - 1);
    } else if (event.key === 'Escape') {
      hideSuggestions();
    } else if (event.key === 'Enter' && activeSuggestion >= 0) {
      event.preventDefault();
      results.querySelectorAll('button')[activeSuggestion]?.click();
    }
  });
  byId('rsvpWelcomeStart').addEventListener('click', () => {
    if (!invitedParty || busy) return;
    chooseParty(invitedParty, 'open');
  });
  byId('changePartyBtn').addEventListener('click', backToSearch);
  byId('rsvpAlreadyBack').addEventListener('click', backToSearch);
  byId('rsvpEditReply').addEventListener('click', () => {
    if (!savedReply) return;
    const party = {
      ...savedReply.party,
      wishes: savedReply.wishes,
      members: savedReply.party.members.map((member, index) => {
        const response = savedReply.responses[index];
        if (!response) return member;
        return { ...member, attending: response.attending, name: response.name || member.name };
      }),
    };
    selectParty(party);
  });
  byId('rsvpRetry').addEventListener('click', loadStatus);

  function repliesFromForm() {
    const values = new FormData(form);
    return selectedParty.members.map((member, index) => {
      const attending = values.get(`attending-${index}`) === 'yes';
      const response = { id: member.id, attending };
      if (member.plusOne) response.name = String(values.get(`guest-name-${index}`) || '').trim();
      return response;
    });
  }

  byId('rsvpContinue').addEventListener('click', () => {
    if (!selectedParty) return;
    const missing = selectedParty.members.findIndex((_, index) => !form.querySelector(`[name="attending-${index}"]:checked`));
    if (missing >= 0) {
      const field = form.querySelector(`[name="attending-${missing}"]`);
      field?.reportValidity();
      scrollToStep(field?.closest('.party-member') || field);
      return;
    }
    const responses = repliesFromForm();
    const unnamedGuest = responses.find((response, index) => selectedParty.members[index].plusOne && response.attending && response.name.length < 2);
    if (unnamedGuest) {
      const field = form.querySelector(`[name="guest-name-${responses.indexOf(unnamedGuest)}"]`);
      field?.setCustomValidity('Add your guest’s name, or mark this plus one as unable to attend.');
      field?.reportValidity();
      scrollToStep(field);
      return;
    }
    byId('rsvpWishesSummary').replaceChildren(...summaryItems(selectedParty, responses));
    openReached('note');
    focus(byId('rsvpWishesHeading'));
  });

  form.addEventListener('input', () => { form.dataset.dirty = '1'; });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy || !selectedParty || !form.reportValidity()) return;
    const responses = repliesFromForm();
    const unnamedGuest = responses.find((response, index) => selectedParty.members[index].plusOne && response.attending && response.name.length < 2);
    if (unnamedGuest) {
      const field = form.querySelector(`[name="guest-name-${responses.indexOf(unnamedGuest)}"]`);
      field?.setCustomValidity('Add your guest’s name, or mark this plus one as unable to attend.');
      field?.reportValidity();
      scrollToStep(field);
      return;
    }
    if (!selectedParty.token && selectedParty.opening) {
      try { await selectedParty.opening; }
      catch { return; }
    }
    const body = {
      action: 'submit', token: selectedParty.token, responses,
      wishes: byId('wishes').value.trim(),
    };
    busy = true;
    form.setAttribute('aria-busy', 'true');
    form.querySelectorAll('button, input, textarea').forEach((el) => { el.disabled = true; });
    submit.textContent = 'Saving…';
    status.textContent = 'Saving your RSVP…';
    try {
      const data = await request(body);
      if (!data.saved) throw new Error('Missing save confirmation');
      selectedParty = rememberSavedParty(selectedParty, responses, body.wishes);
      savedReply = { party: selectedParty, responses, wishes: body.wishes };
      const anyoneAttending = responses.some((response) => response.attending);
      const confirmation = confirmationMessage(anyoneAttending);
      byId('rsvpSuccessMessage').textContent = confirmation.title;
      byId('rsvpSuccessDetail').textContent = confirmation.detail;
      byId('rsvpSummary').replaceChildren(...summaryItems(selectedParty, responses));
      showStep('success');
      scrollToStep(byId('rsvpSuccessStep'), () => {
        focus(byId('rsvpSuccessHeading'));
        if (anyoneAttending) celebrate();
      });
    } catch (error) {
      status.textContent = errorMessage(error);
      // Preserve all answers and wishes on a failed save.
      if (error.status === 401) {
        status.textContent = 'Your session has expired. Find your invitation again to continue.';
      }
    } finally {
      busy = false;
      form.removeAttribute('aria-busy');
      form.querySelectorAll('button, input, textarea').forEach((el) => { el.disabled = false; });
      submit.textContent = 'Confirm RSVP';
    }
  });
  window.addEventListener('resize', () => {
    if (byId('rsvpSearchStep')?.hidden) return;
    slideTo(slideIndex, { animate: false });
  });
  const notePane = byId('wishes')?.closest('.rsvp-card__pane');
  if (notePane && 'ResizeObserver' in window) {
    new ResizeObserver(() => {
      if (slideIndex !== 2) return;
      const viewport = byId('rsvpSlide');
      if (!viewport) return;
      viewport.style.transition = 'none';
      viewport.style.height = `${notePane.offsetHeight}px`;
    }).observe(notePane);
  }
  loadStatus();
}
