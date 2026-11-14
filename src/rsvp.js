import { weddingConfig } from './wedding-config.js';
import { highlightUnmatched, suggestGuests } from '../supabase/functions/wedding-rsvp/matching.js';

export function initRsvp(lenis) {
  if (!document.getElementById('rsvp')) return;
  const byId = (id) => document.getElementById(id);
  const searchForm = byId('rsvpLookupForm');
  const input = byId('guestSearch');
  const clearBtn = byId('guestSearchClear');
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
  let applyingHistory = false;
  const pageQuery = new URLSearchParams(location.search);
  const inviteMode = Boolean(inviteToken());
  // Open RSVP enters the same immersive experience after a name match.
  let experienceActive = inviteMode;

  function inviteToken() {
    const value = (pageQuery.get('invite') || '').trim();
    return /^iv1\.[A-Za-z0-9_-]{20,200}$/.test(value) ? value : '';
  }

  function inExperience() {
    return inviteMode || experienceActive;
  }

  function rsvpHistoryState(step) {
    return { ...(history.state || {}), rsvp: step };
  }

  function syncRsvpHistory(step, mode = 'push') {
    if (applyingHistory || mode === 'none') return;
    const current = history.state?.rsvp;
    if (mode === 'replace' || current == null) {
      history.replaceState(rsvpHistoryState(step), '', location.href);
      return;
    }
    if (current === step) return;
    history.pushState(rsvpHistoryState(step), '', location.href);
  }

  // Keep an edit step under success so browser Back opens the attendance UI.
  function enterSuccessHistory() {
    if (applyingHistory) return;
    if (history.state?.rsvp === 'success') return;
    if (history.state?.rsvp !== 'confirm' && history.state?.rsvp !== 'note') {
      history.replaceState(rsvpHistoryState('confirm'), '', location.href);
    }
    history.pushState(rsvpHistoryState('success'), '', location.href);
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
    const card = byId('rsvpCard');
    if (card) card.classList.toggle('is-success', screen === 'success');
    if (inExperience()) {
      document.documentElement.classList.toggle('is-invite-success', screen === 'success');
      document.getElementById('rsvp')?.classList.toggle('rsvp--invite-success', screen === 'success');
      if (screen === 'success') {
        document.documentElement.classList.remove('is-invite-welcome', 'is-invite-confirm');
        document.getElementById('rsvp')?.classList.remove('rsvp--invite-confirm', 'rsvp--invite-leaving');
      }
    }
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

  function syncInviteStage(stage) {
    if (!inExperience()) return;
    document.documentElement.classList.toggle('is-invite-welcome', stage === 'find');
    document.documentElement.classList.toggle('is-invite-confirm', stage === 'confirm' || stage === 'already');
    document.getElementById('rsvp')?.classList.toggle('rsvp--invite-confirm', stage === 'confirm' || stage === 'already');
  }

  function openReached(stage, { scroll = true, animate = true } = {}) {
    currentStage = stage;
    if (stage === 'confirm' || stage === 'already') confirmStage = stage;
    syncInviteStage(stage);
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
    slideTo(here, { animate: inExperience() && here === 1 ? true : animate });
    if (!scroll) return;
    const targets = {
      find: byId('rsvpFindBlock'),
      confirm: byId('rsvpConfirmBlock'),
      already: byId('rsvpAlreadyBody'),
      note: byId('rsvpNoteBlock'),
    };
    scrollToStep(targets[stage]);
  }
  const focus = (el) => {
    if (!el) return;
    el.focus({ preventScroll: true });
    // Programmatic focus on headings can leave the names text selected in Safari.
    window.getSelection()?.removeAllRanges();
  };

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

  function isAttendingAny(answer) {
    if (!answer) return false;
    if (typeof answer.ceremony === 'boolean' || typeof answer.reception === 'boolean') {
      return answer.ceremony === true || answer.reception === true;
    }
    return answer.attending === true;
  }

  function attendanceLabel(answer) {
    const ceremony = answer?.ceremony === true;
    const reception = answer?.reception === true;
    if (ceremony && reception) return 'Ceremony & reception';
    if (ceremony) return 'Ceremony only';
    if (reception) return 'Reception only';
    if (answer?.ceremony === false && answer?.reception === false) return 'Unable to attend';
    if (answer?.attending === true) return 'Attending';
    if (answer?.attending === false) return 'Unable to attend';
    return 'No response';
  }

  function rememberSavedParty(party, responses, wishes) {
    const saved = {
      ...party,
      replied: true,
      wishes,
      members: party.members.map((member, index) => {
        const answer = responses[index] || {};
        const named = typeof answer.name === 'string' ? answer.name.trim() : '';
        const ceremony = typeof answer.ceremony === 'boolean' ? answer.ceremony : answer.attending;
        const reception = typeof answer.reception === 'boolean' ? answer.reception : answer.attending;
        return {
          ...member,
          attending: ceremony === true || reception === true,
          ceremony,
          reception,
          ...(member.plusOne && named ? { name: named } : {}),
        };
      }),
    };
    guestList = guestList.map((item) => item.id === party.id ? { ...saved, token: item.token } : item);
    return saved;
  }

  function attendanceLine(members) {
    const attending = members.filter((member) => isAttendingAny(member)).length;
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

  function openEventDialog(event) {
    const dialog = byId('rsvpEventDialog');
    if (!dialog || !event) return;
    byId('rsvpEventDialogTitle').textContent = event.label;
    byId('rsvpEventDialogDetail').textContent = event.detail;
    byId('rsvpEventDialogPlace').textContent = event.place || '';
    const address = byId('rsvpEventDialogAddress');
    address.textContent = event.address || '';
    address.href = event.mapUrl || '#';
    address.hidden = !event.address;
    byId('rsvpEventDialogSummary').textContent = event.summary || '';
    const link = byId('rsvpEventDialogLink');
    const photo = byId('rsvpEventDialogPhoto');
    link.href = event.pageUrl || event.mapUrl || '#';
    photo.src = event.photo || '';
    photo.alt = event.photoAlt || event.place || '';
    link.hidden = !event.photo;
    if (!dialog.open) dialog.showModal();
  }

  function bindEventDialog() {
    const dialog = byId('rsvpEventDialog');
    if (!dialog || dialog.dataset.bound === '1') return;
    dialog.dataset.bound = '1';
    byId('rsvpEventDialogClose')?.addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close();
    });
  }

  bindEventDialog();

  function summaryItems(party, responses = party.members) {
    return responses.map((response, index) => {
      const attending = isAttendingAny(response);
      const unable = response.ceremony === false && response.reception === false
        || (response.attending === false && response.ceremony == null && response.reception == null);
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
      label.textContent = attendanceLabel(response);
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
    if (inExperience() && party.replied) {
      renderSuccess(party, responsesFromParty(party), party.wishes || '', { celebrate: false, moveFocus: false });
      return;
    }
    if (inExperience() || !party.replied) selectParty(party, { animate });
    else showAlready(party);
  }

  function inviteContinueLabel(party = selectedParty) {
    return party?.replied ? 'Save RSVP Changes' : 'Confirm RSVP';
  }

  function chooseParty(party, mode) {
    if (!inviteMode) {
      startOpenExperience(party);
      return;
    }
    if (mode === 'edit') selectParty(party);
    else openInvitation(party);
    // Invite links already return a submit token — don't burn the IP rate
    // limit on a redundant open when guests tap RSVP from a QR code.
    if (party.token && mode !== 'edit') {
      if (selectedParty?.id === party.id) {
        selectedParty.token = party.token;
        selectedParty.opening = Promise.resolve(party);
      }
      return;
    }
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

  function startOpenExperience(party) {
    const opening = openParty(party).then((opened) => {
      const withToken = { ...opened, token: opened.token, opening };
      if (invitedParty?.id === party.id) invitedParty = withToken;
      if (selectedParty?.id === party.id) {
        selectedParty.token = opened.token;
        selectedParty.opening = opening;
      }
      return withToken;
    }).catch((error) => {
      if (invitedParty?.id === party.id || selectedParty?.id === party.id) {
        status.textContent = errorMessage(error);
      }
      throw error;
    });

    // Already replied: match invite links and open on the success screen.
    if (party.replied) {
      busy = true;
      status.textContent = 'Opening your RSVP…';
      opening.then((opened) => {
        busy = false;
        status.textContent = '';
        experienceActive = true;
        invitedParty = opened;
        applyExperienceChrome();
        renderSuccess(opened, responsesFromParty(opened), opened.wishes || '', {
          celebrate: false,
          moveFocus: false,
        });
      }).catch(() => {
        busy = false;
      });
      return;
    }

    experienceActive = true;
    invitedParty = { ...party, opening };
    applyExperienceChrome();
    document.documentElement.classList.add('is-invite-welcome');

    const greeting = byId('rsvpWelcomeGreeting');
    if (greeting) greeting.textContent = party.label;
    const welcomeStart = byId('rsvpWelcomeStart');
    if (welcomeStart) {
      welcomeStart.textContent = 'RSVP';
      welcomeStart.disabled = false;
    }
    byId('rsvpWelcome').hidden = false;
    showStep('search');
    openReached('find', { scroll: false, animate: false });
    syncRsvpHistory('find', 'push');
    playInviteReveal();
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

  function playInviteReveal() {
    const reveal = byId('inviteReveal');
    const welcome = byId('rsvpWelcome');
    if (!welcome) return;
    welcome.classList.remove('is-revealed');
    if (reveal) reveal.classList.remove('is-ready');
    welcome.offsetHeight;
    requestAnimationFrame(() => {
      if (reveal) reveal.classList.add('is-ready');
      welcome.classList.add('is-revealed');
    });
  }

  function applyExperienceChrome() {
    experienceActive = true;
    document.documentElement.classList.add('is-invite');
    document.getElementById('rsvp')?.classList.add('rsvp--invite');
    byId('rsvpHelp').hidden = true;
    searchForm.hidden = true;
    const intro = byId('rsvpCardIntro');
    if (intro) intro.hidden = true;
    const welcomeLabel = byId('rsvpFindHeading')?.querySelector('.rsvp-story__label');
    if (welcomeLabel) welcomeLabel.textContent = 'Welcome';
  }

  function clearExperienceChrome() {
    if (inviteMode) return;
    experienceActive = false;
    invitedParty = null;
    document.documentElement.classList.remove(
      'is-invite',
      'is-invite-welcome',
      'is-invite-confirm',
      'is-invite-success',
    );
    document.getElementById('rsvp')?.classList.remove(
      'rsvp--invite',
      'rsvp--invite-confirm',
      'rsvp--invite-success',
      'rsvp--invite-leaving',
    );
    byId('rsvpHelp').hidden = false;
    searchForm.hidden = false;
    const intro = byId('rsvpCardIntro');
    if (intro) intro.hidden = false;
    const welcome = byId('rsvpWelcome');
    if (welcome) {
      welcome.hidden = true;
      welcome.classList.remove('is-revealed', 'is-leaving');
    }
    const welcomeLabel = byId('rsvpFindHeading')?.querySelector('.rsvp-story__label');
    if (welcomeLabel) welcomeLabel.textContent = 'Find your invitation';
  }

  function applyInviteChrome(party) {
    invitedParty = party;
    applyExperienceChrome();

    // After RSVPing, the invite link reopens on the success screen.
    if (party.replied) {
      const responses = responsesFromParty(party);
      renderSuccess(party, responses, party.wishes || '', { celebrate: false, moveFocus: false });
      return;
    }

    const greeting = byId('rsvpWelcomeGreeting');
    if (greeting) greeting.textContent = party.label;
    const welcomeStart = byId('rsvpWelcomeStart');
    if (welcomeStart) welcomeStart.textContent = 'RSVP';
    byId('rsvpWelcome').hidden = false;
    openReached('find', { scroll: false, animate: false });
    syncRsvpHistory('find', 'replace');
    playInviteReveal();
  }

  function selectParty(party, { animate = true, historyMode = 'push' } = {}) {
    const opening = party.opening || (selectedParty?.id === party.id ? selectedParty.opening : null);
    selectedParty = opening ? { ...party, opening } : party;
    form.dataset.dirty = '';
    form.reset();
    members.replaceChildren();
    const heading = byId('partyHeading');
    const intro = byId('rsvpConfirmIntro');
    const namedGuests = party.members.filter((member) => !member.plusOne);
    const several = namedGuests.length > 1;
    const first = (namedGuests[0] || party.members[0]).name.trim().split(/\s+/)[0];
    heading.textContent = inExperience()
      ? 'Confirm your attendance'
      : `${first}${/s$/i.test(first) ? '’' : '’s'} Party`;
    heading.hidden = inExperience() ? false : !several;
    if (inExperience()) {
      if (intro) {
        intro.hidden = true;
        intro.textContent = '';
      }
    } else if (intro) {
      intro.textContent = party.members.length > 1
        ? 'Everyone is marked as attending both events. Uncheck a box if someone can’t make that part.'
        : 'You’re marked as attending both events. Uncheck a box if you can’t make that part.';
      intro.hidden = false;
    }
    const confirmPhoto = byId('inviteConfirmPhoto');
    const confirmMeta = byId('inviteConfirmMeta');
    if (confirmPhoto) {
      confirmPhoto.hidden = !inExperience();
      if (inExperience()) {
        confirmPhoto.classList.remove('is-revealed');
        confirmPhoto.offsetHeight;
        requestAnimationFrame(() => confirmPhoto.classList.add('is-revealed'));
      }
    }
    if (confirmMeta) {
      confirmMeta.hidden = !inExperience();
      if (inExperience()) {
        confirmMeta.replaceChildren();
        const date = document.createElement('p');
        date.className = 'invite-confirm__date';
        date.textContent = '05.29.2027';
        const place = document.createElement('p');
        place.className = 'invite-confirm__place';
        place.textContent = 'AMES, IA';
        confirmMeta.append(date, place);
      }
    }

    const table = document.createElement('div');
    table.className = inExperience() ? 'party-attendance party-attendance--invite' : 'party-attendance';

    const head = document.createElement('div');
    head.className = 'party-attendance__head';
    const headGuest = document.createElement('span');
    headGuest.className = 'party-attendance__spacer';
    headGuest.setAttribute('aria-hidden', 'true');
    head.append(headGuest);
    [['ceremony', weddingConfig.events.ceremony], ['reception', weddingConfig.events.reception]].forEach(([, event]) => {
      const col = document.createElement('div');
      col.className = 'party-attendance__event';
      const infoBtn = document.createElement('button');
      infoBtn.type = 'button';
      infoBtn.className = 'party-attendance__event-btn';
      infoBtn.setAttribute('aria-label', `${event.label} details`);
      const titleRow = document.createElement('span');
      titleRow.className = 'party-attendance__event-title';
      const title = document.createElement('strong');
      title.textContent = event.label;
      const icon = phosphorIcon('M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm16-40a8,8,0,0,1-8,8,16,16,0,0,1-16-16V128a8,8,0,0,1,0-16,16,16,0,0,1,16,16v40A8,8,0,0,1,144,176ZM112,84a12,12,0,1,1,12,12A12,12,0,0,1,112,84Z');
      icon.setAttribute('aria-hidden', 'true');
      icon.classList.add('party-attendance__info-icon');
      titleRow.append(title, icon);
      const detail = document.createElement('small');
      detail.textContent = event.detail;
      infoBtn.append(titleRow, detail);
      infoBtn.addEventListener('click', () => openEventDialog(event));
      col.append(infoBtn);
      head.append(col);
    });
    table.append(head);

    party.members.forEach((member, index) => {
      const row = document.createElement('div');
      row.className = 'party-member';

      const name = document.createElement('p');
      name.id = `party-member-name-${index}`;
      name.className = 'party-member__name';
      name.textContent = member.name;

      const checks = document.createElement('div');
      checks.className = 'party-member__checks';

      [['ceremony', weddingConfig.events.ceremony], ['reception', weddingConfig.events.reception]].forEach(([key, event]) => {
        const label = document.createElement('label');
        label.className = 'party-member__check';
        const input = document.createElement('input');
        Object.assign(input, {
          type: 'checkbox',
          name: `${key}-${index}`,
          value: 'yes',
        });
        input.setAttribute('aria-label', `${event.label} for ${member.name}`);
        input.checked = member[key] !== false;
        const caption = document.createElement('span');
        caption.className = 'party-member__check-label';
        caption.textContent = event.label;
        label.append(input, caption);
        checks.append(label);
      });

      row.append(name, checks);

      if (member.plusOne) {
        row.classList.add('party-member--plus');
        const guestFields = document.createElement('div');
        guestFields.className = 'party-member__guest';
        guestFields.hidden = true;
        const nameLabel = document.createElement('label');
        nameLabel.className = 'party-member__guest-name';
        nameLabel.htmlFor = `guest-name-${index}`;
        nameLabel.textContent = inExperience() ? 'Plus one’s Name' : 'Guest’s name';
        const nameInput = document.createElement('input');
        nameInput.id = `guest-name-${index}`;
        Object.assign(nameInput, {
          type: 'text',
          name: `guest-name-${index}`,
          maxLength: 80,
          autocomplete: 'name',
          placeholder: 'First and last name',
        });
        nameInput.addEventListener('input', () => { nameInput.setCustomValidity(''); });
        const savedName = String(member.name || '').trim();
        const syncGuest = () => {
          const attending = isAttendingAny({
            ceremony: row.querySelector(`[name="ceremony-${index}"]`)?.checked,
            reception: row.querySelector(`[name="reception-${index}"]`)?.checked,
          });
          guestFields.hidden = !attending;
          row.classList.toggle('is-naming', attending);
          if (!attending) {
            nameInput.value = '';
            nameInput.setCustomValidity('');
          }
        };
        if (savedName && !/^plus one( \d+)?$/i.test(savedName)) {
          nameInput.value = savedName;
        }
        checks.addEventListener('change', syncGuest);
        syncGuest();
        guestFields.append(nameLabel, nameInput);
        row.append(guestFields);
      }

      table.append(row);
    });

    if (party.members.length > 1) {
      const foot = document.createElement('div');
      foot.className = 'party-attendance__foot';
      const spacer = document.createElement('span');
      spacer.className = 'party-attendance__spacer';
      const allBtn = document.createElement('button');
      allBtn.type = 'button';
      allBtn.className = 'party-attendance__all';
      const eventBoxes = () => [...table.querySelectorAll('.party-member__check input')];
      const syncAllLabel = () => {
        const boxes = eventBoxes();
        const allOn = boxes.length > 0 && boxes.every((box) => box.checked);
        allBtn.textContent = allOn ? 'Clear all' : 'Select all';
        allBtn.setAttribute('aria-pressed', String(allOn));
      };
      allBtn.addEventListener('click', () => {
        const boxes = eventBoxes();
        const allOn = boxes.every((box) => box.checked);
        boxes.forEach((box) => {
          box.checked = !allOn;
          box.dispatchEvent(new Event('change', { bubbles: true }));
        });
        form.dataset.dirty = '1';
        syncAllLabel();
      });
      table.addEventListener('change', syncAllLabel);
      syncAllLabel();
      foot.append(spacer, allBtn);
      table.append(foot);
    }

    members.append(table);
    if (party.wishes) byId('wishes').value = party.wishes;
    const continueBtn = byId('rsvpContinue');
    if (continueBtn) continueBtn.textContent = inExperience() ? inviteContinueLabel(party) : 'Continue';
    showStep('confirm');
    openReached('confirm', { animate });
    syncRsvpHistory('confirm', historyMode);
    if (several || inExperience()) focus(heading);
  }

  function confirmationMessage(anyoneAttending) {
    return anyoneAttending
      ? { title: 'You’re all set!', detail: 'We can’t wait to celebrate with you.' }
      : { title: 'We’ll miss you.', detail: 'Thank you for letting us know.' };
  }

  function responsesFromParty(party) {
    return (party.members || []).map((member) => {
      const ceremony = typeof member.ceremony === 'boolean' ? member.ceremony : member.attending === true;
      const reception = typeof member.reception === 'boolean' ? member.reception : member.attending === true;
      return {
        id: member.id,
        name: member.name,
        ceremony,
        reception,
        attending: ceremony || reception,
      };
    });
  }

  function partyFromSavedReply() {
    if (!savedReply?.party) return null;
    return {
      ...savedReply.party,
      wishes: savedReply.wishes,
      members: savedReply.party.members.map((member, index) => {
        const response = savedReply.responses[index];
        if (!response) return member;
        const ceremony = typeof response.ceremony === 'boolean' ? response.ceremony : response.attending;
        const reception = typeof response.reception === 'boolean' ? response.reception : response.attending;
        return {
          ...member,
          attending: ceremony === true || reception === true,
          ceremony,
          reception,
          name: response.name || member.name,
        };
      }),
    };
  }

  function editSavedReply({ animate = true, historyMode = 'replace' } = {}) {
    const party = partyFromSavedReply() || selectedParty;
    if (!party) return false;
    selectParty(party, { animate, historyMode: 'none' });
    syncRsvpHistory('confirm', historyMode);
    return true;
  }

  function showInviteWelcomeScreen() {
    if (!invitedParty) return;
    document.documentElement.classList.add('is-invite-welcome');
    document.documentElement.classList.remove('is-invite-success', 'is-invite-confirm');
    document.getElementById('rsvp')?.classList.remove(
      'rsvp--invite-success',
      'rsvp--invite-confirm',
      'rsvp--invite-leaving',
    );
    const greeting = byId('rsvpWelcomeGreeting');
    if (greeting) greeting.textContent = invitedParty.label;
    const welcomeStart = byId('rsvpWelcomeStart');
    if (welcomeStart) welcomeStart.textContent = 'RSVP';
    const welcome = byId('rsvpWelcome');
    if (welcome) {
      welcome.hidden = false;
      welcome.classList.remove('is-leaving');
    }
    showStep('search');
    openReached('find', { scroll: false, animate: false });
    playInviteReveal();
    syncRsvpHistory('find', applyingHistory ? 'none' : 'replace');
  }

  function renderSuccess(party, responses, wishes = '', {
    celebrate: shouldCelebrate = false,
    moveFocus = true,
    historyMode = 'enter',
  } = {}) {
    selectedParty = party;
    savedReply = { party, responses, wishes };
    const anyoneAttending = responses.some((response) => isAttendingAny(response));
    const confirmation = confirmationMessage(anyoneAttending);
    byId('rsvpSuccessMessage').textContent = confirmation.title;
    byId('rsvpSuccessDetail').textContent = confirmation.detail;
    byId('rsvpSummary').replaceChildren(...summaryItems(party, responses));
    const prepareNote = byId('rsvpPrepareNote');
    if (prepareNote) prepareNote.hidden = false;
    const welcome = byId('rsvpWelcome');
    if (welcome) {
      welcome.hidden = true;
      welcome.classList.remove('is-revealed', 'is-leaving');
    }
    document.documentElement.classList.remove('is-invite-welcome');
    document.getElementById('rsvp')?.classList.remove('rsvp--invite-leaving');
    showStep('success');
    if (historyMode === 'enter') enterSuccessHistory();
    else syncRsvpHistory('success', historyMode);
    playSuccessReveal();
    scrollToStep(byId('rsvpSuccessStep'), () => {
      if (moveFocus) focus(byId('rsvpSuccessHeading'));
      if (!shouldCelebrate || !anyoneAttending) return;
      window.setTimeout(() => { celebrate(); }, inExperience() ? 380 : 80);
    });
  }

  function playSuccessReveal() {
    const step = byId('rsvpSuccessStep');
    if (!step) return;
    step.classList.remove('is-revealed');
    step.offsetHeight;
    requestAnimationFrame(() => step.classList.add('is-revealed'));
  }

  function loadImage(src) {
    return new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
      image.src = src;
    });
  }

  async function celebrate() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    document.querySelectorAll('.rsvp-confetti').forEach((node) => node.remove());
    const flowerSources = [
      '/images/letter/rose.png?v=2',
      '/images/letter/wildrose.png?v=2',
      '/images/letter/bud.png?v=2',
      '/images/letter/blossom.png?v=2',
      '/images/letter/peony.png?v=2',
      '/images/letter/leaf.png?v=2',
    ];
    const flowers = (await Promise.all(flowerSources.map(loadImage))).filter(Boolean);
    if (!flowers.length) return;

    const photo = byId('rsvpSuccessPhoto');
    const originBox = (photo || byId('rsvpSuccessHeading'))?.getBoundingClientRect();
    if (!originBox) return;

    const canvas = document.createElement('canvas');
    canvas.className = 'rsvp-confetti';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.append(canvas);
    const context = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const burstX = originBox.left + originBox.width / 2;
    const burstY = originBox.top + originBox.height * 0.35;
    const total = 72;
    const duration = 4800;
    const pieces = [];
    for (let i = 0; i < total; i += 1) {
      const fromTop = i % 3 === 0;
      const angle = fromTop
        ? Math.PI * 0.5 + (Math.random() - 0.5) * 0.7
        : -Math.PI * 0.5 + (Math.random() - 0.5) * Math.PI;
      const speed = fromTop ? 1.2 + Math.random() * 2.4 : 4.5 + Math.random() * 6.5;
      pieces.push({
        x: fromTop ? Math.random() * window.innerWidth : burstX + (Math.random() - 0.5) * 40,
        y: fromTop ? -20 - Math.random() * 80 : burstY + (Math.random() - 0.5) * 24,
        size: 16 + Math.random() * 22,
        vx: Math.cos(angle) * speed * (fromTop ? 0.35 : 1),
        vy: Math.sin(angle) * speed + (fromTop ? 1.5 : -2.4),
        spin: Math.random() * Math.PI * 2,
        spinV: -0.1 + Math.random() * 0.2,
        image: flowers[Math.floor(Math.random() * flowers.length)],
        alpha: 0.78 + Math.random() * 0.22,
        delay: fromTop ? Math.random() * 900 : Math.random() * 180,
      });
    }

    const started = performance.now();
    const draw = (now) => {
      const elapsed = now - started;
      context.clearRect(0, 0, window.innerWidth, window.innerHeight);
      pieces.forEach((piece) => {
        if (elapsed < piece.delay) return;
        piece.vy += 0.085;
        piece.x += piece.vx;
        piece.y += piece.vy;
        piece.vx *= 0.994;
        piece.spin += piece.spinV;
        const life = Math.max(0, 1 - (elapsed - piece.delay) / (duration - piece.delay));
        context.save();
        context.translate(piece.x, piece.y);
        context.rotate(piece.spin);
        context.globalAlpha = piece.alpha * Math.min(1, life * 1.4);
        context.drawImage(piece.image, -piece.size / 2, -piece.size / 2, piece.size, piece.size);
        context.restore();
      });
      if (elapsed < duration) requestAnimationFrame(draw);
      else canvas.remove();
    };
    requestAnimationFrame(draw);
  }

  function syncClearButton() {
    if (!clearBtn) return;
    clearBtn.hidden = !input.value;
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
    syncClearButton();
    clearExperienceChrome();
    openReached('find');
    showStep('search');
    syncRsvpHistory('search', 'replace');
    focus(input);
  }

  function backToSearch() {
    selectedParty = null;
    savedReply = null;
    form.reset();
    clearExperienceChrome();
    openReached('find');
    showStep('search');
    syncRsvpHistory('search', applyingHistory ? 'none' : 'push');
    renderSuggestions();
    focus(input);
  }

  function setLookupReady(ready) {
    input.readOnly = !ready;
    input.setAttribute('aria-disabled', ready ? 'false' : 'true');
    input.setAttribute('aria-busy', ready ? 'false' : 'true');
  }

  function beginInviteWelcome() {
    applyExperienceChrome();
    document.documentElement.classList.add('is-invite-welcome');
    const welcome = byId('rsvpWelcome');
    if (welcome) {
      welcome.hidden = true;
      welcome.classList.remove('is-leaving', 'is-revealed');
    }
  }

  async function loadStatus() {
    if (inviteMode) beginInviteWelcome();
    showStep('search');
    openReached('find', { scroll: false });
    setLookupReady(false);
    try {
      if (inviteMode) {
        const data = await request({ action: 'invite', invite: inviteToken() });
        const party = { ...data.party, token: data.token };
        applyInviteChrome(party);
        return;
      }
      const parties = await loadGuestList();
      if (!parties.length) {
        showStep('pending');
        return;
      }
      showStep('search');
      openReached('find', { scroll: false });
      syncRsvpHistory('search', 'replace');
      setLookupReady(true);
      renderSuggestions();
    } catch (error) {
      if (inviteMode && error.status === 404) {
        showStep('missing');
        return;
      }
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
    syncClearButton();
    renderSuggestions();
  });
  clearBtn?.addEventListener('click', () => {
    if (input.readOnly) return;
    input.value = '';
    syncClearButton();
    hideSuggestions();
    status.textContent = '';
    focus(input);
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
  byId('rsvpWelcomeStart').addEventListener('click', async () => {
    if (!invitedParty || busy) return;
    const welcomeStart = byId('rsvpWelcomeStart');
    const welcome = byId('rsvpWelcome');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    busy = true;
    if (welcomeStart) welcomeStart.disabled = true;
    let party = invitedParty;
    try {
      if (party.opening) party = await party.opening;
    } catch {
      busy = false;
      if (welcomeStart) welcomeStart.disabled = false;
      return;
    }
    busy = false;
    if (welcomeStart) welcomeStart.disabled = false;
    const go = (() => {
      let done = false;
      return () => {
        if (done) return;
        done = true;
        openInvitation(party);
      };
    })();
    if (!welcome || reduced || welcome.classList.contains('is-leaving') || party.replied) {
      go();
      return;
    }
    welcome.classList.add('is-leaving');
    document.getElementById('rsvp')?.classList.add('rsvp--invite-leaving');
    welcome.addEventListener('transitionend', (event) => {
      if (event.target !== welcome || event.propertyName !== 'opacity') return;
      go();
    }, { once: true });
    window.setTimeout(go, 480);
  });
  byId('changePartyBtn').addEventListener('click', backToSearch);
  byId('rsvpAlreadyBack').addEventListener('click', backToSearch);
  byId('rsvpEditReply').addEventListener('click', () => {
    if (!savedReply) return;
    // Prefer browser Back so Forward returns to success.
    if (history.state?.rsvp === 'success') {
      history.back();
      return;
    }
    editSavedReply({ animate: true, historyMode: 'replace' });
  });
  byId('rsvpRetry').addEventListener('click', loadStatus);

  window.addEventListener('popstate', () => {
    const step = history.state?.rsvp;
    if (!step) return;
    applyingHistory = true;
    try {
      if (step === 'success' && savedReply) {
        renderSuccess(savedReply.party, savedReply.responses, savedReply.wishes || '', {
          celebrate: false,
          moveFocus: false,
          historyMode: 'none',
        });
        return;
      }
      if (step === 'confirm') {
        if (!editSavedReply({ animate: false, historyMode: 'none' }) && selectedParty) {
          selectParty(selectedParty, { animate: false, historyMode: 'none' });
        }
        return;
      }
      if (step === 'note' && selectedParty) {
        showStep('search');
        openReached('note', { animate: false });
        return;
      }
      if (step === 'find') {
        if (invitedParty && inExperience()) {
          showInviteWelcomeScreen();
          return;
        }
        backToSearch();
        return;
      }
      if (step === 'search') {
        backToSearch();
      }
    } finally {
      applyingHistory = false;
    }
  });

  function repliesFromForm() {
    return selectedParty.members.map((member, index) => {
      const ceremony = Boolean(form.querySelector(`[name="ceremony-${index}"]`)?.checked);
      const reception = Boolean(form.querySelector(`[name="reception-${index}"]`)?.checked);
      const response = {
        id: member.id,
        ceremony,
        reception,
        attending: ceremony || reception,
      };
      if (member.plusOne) response.name = String(new FormData(form).get(`guest-name-${index}`) || '').trim();
      return response;
    });
  }

  byId('rsvpContinue').addEventListener('click', () => {
    if (!selectedParty) return;
    const responses = repliesFromForm();
    const unnamedGuest = responses.find((response, index) => selectedParty.members[index].plusOne && response.attending && response.name.length < 2);
    if (unnamedGuest) {
      const field = form.querySelector(`[name="guest-name-${responses.indexOf(unnamedGuest)}"]`);
      field?.setCustomValidity('Add your guest’s name, or uncheck both events for this plus one.');
      field?.reportValidity();
      scrollToStep(field);
      return;
    }
    if (inExperience()) {
      form.requestSubmit();
      return;
    }
    byId('rsvpWishesSummary').replaceChildren(...summaryItems(selectedParty, responses));
    openReached('note');
    syncRsvpHistory('note', 'push');
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
      field?.setCustomValidity('Add your guest’s name, or uncheck both events for this plus one.');
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
    const continueBtn = byId('rsvpContinue');
    if (inExperience() && continueBtn) continueBtn.textContent = 'Saving…';
    status.textContent = 'Saving your RSVP…';
    try {
      const data = await request(body);
      if (!data.saved) throw new Error('Missing save confirmation');
      selectedParty = rememberSavedParty(selectedParty, responses, body.wishes);
      renderSuccess(selectedParty, responses, body.wishes, { celebrate: true });
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
      const continueBtn = byId('rsvpContinue');
      if (continueBtn) continueBtn.textContent = inExperience() ? inviteContinueLabel() : 'Continue';
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
