import { weddingConfig } from './wedding-config.js';
import { highlightUnmatched, matchParties, parseCsv, partiesFromRows, suggestGuests } from '../supabase/functions/wedding-rsvp/matching.js';

export function initRsvp() {
  if (!document.getElementById('rsvp')) return;
  const byId = (id) => document.getElementById(id);
  const searchForm = byId('rsvpLookupForm');
  const input = byId('guestSearch');
  const results = byId('guestResults');
  const form = byId('rsvpForm');
  const members = byId('partyMembers');
  const status = byId('rsvpStatus');
  const submit = byId('rsvpSubmit');
  const savedRepliesKey = 'katie-andrew-rsvp-replies';
  let selectedParty = null;
  let savedReply = null;
  let guestList = [];
  let activeSuggestion = -1;
  let busy = false;

  function showStep(step) {
    const screen = step === 'confirm' || step === 'already' ? 'search' : step;
    ['Loading', 'Pending', 'Search', 'Success', 'Unavailable'].forEach((name) => {
      byId(`rsvp${name}Step`).hidden = name.toLowerCase() !== screen;
    });
    status.textContent = '';
  }

  function setStepOpen(block, open) {
    block.classList.toggle('is-open', open);
    block.querySelectorAll(':scope > .rsvp-step-block__body').forEach((body) => { body.hidden = !open; });
  }

  let currentStage = 'find';
  let confirmStage = 'confirm';

  function openReached(stage) {
    currentStage = stage;
    if (stage === 'confirm' || stage === 'already') confirmStage = stage;
    const confirmBody = byId('rsvpConfirmBody');
    const alreadyBody = byId('rsvpAlreadyBody');
    const noteBody = byId('rsvpNoteBody');
    setStepOpen(byId('rsvpFindBlock'), stage === 'find');
    setStepOpen(byId('rsvpConfirmBlock'), stage === 'confirm' || stage === 'already');
    setStepOpen(byId('rsvpNoteBlock'), stage === 'note');
    confirmBody.hidden = stage !== 'confirm';
    alreadyBody.hidden = stage !== 'already';
    noteBody.hidden = stage !== 'note';
    const order = { find: 0, confirm: 1, already: 1, note: 2 };
    const here = order[stage];
    [
      [byId('rsvpFindBlock'), byId('rsvpFindHeading'), here > 0, 'find'],
      [byId('rsvpConfirmBlock'), byId('rsvpConfirmHeading'), here > 1 && selectedParty, confirmStage],
    ].forEach(([block, heading, canGoBack, next]) => {
      block.classList.toggle('is-back', canGoBack);
      heading.classList.toggle('is-back', canGoBack);
      block.onclick = canGoBack ? (event) => {
        if (event.target.closest('.rsvp-step-block__body, .guest-results')) return;
        openReached(next);
      } : null;
      heading.onclick = null;
    });
    byId('rsvpNoteBlock').classList.remove('is-back');
    byId('rsvpWishesHeading').classList.remove('is-back');
    byId('rsvpWishesHeading').onclick = null;
  }
  const focus = (el) => el.focus({ preventScroll: true });

  async function loadGuestList() {
    if (!weddingConfig.guestSheetCsvUrl) throw new Error('Guest list is not configured');
    const response = await fetch(`${weddingConfig.guestSheetCsvUrl}&t=${Date.now()}`, {
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw new Error('Guest list unavailable');
    guestList = partiesFromRows(parseCsv(await response.text())).map(applyRememberedReply);
    return guestList;
  }

  function readReplies() {
    try {
      const saved = JSON.parse(localStorage.getItem(savedRepliesKey) || '{}');
      return saved && typeof saved === 'object' ? saved : {};
    } catch {
      return {};
    }
  }

  function rememberReply(party, responses, wishes) {
    const replies = readReplies();
    replies[party.id] = {
      wishes,
      updated_at: new Date().toISOString(),
      responses: responses.map((response, index) => ({
        id: response.id,
        name: response.name || party.members[index].name,
        attending: response.attending,
      })),
    };
    localStorage.setItem(savedRepliesKey, JSON.stringify(replies));
  }

  function applyRememberedReply(party) {
    if (party.replied) return party;
    const reply = readReplies()[party.id];
    if (!reply?.responses) return party;
    return {
      ...party,
      replied: true,
      wishes: reply.wishes || '',
      members: party.members.map((member) => {
        const answer = reply.responses.find((item) => item.id === member.id);
        if (!answer) return member;
        return { ...member, name: answer.name || member.name, attending: answer.attending };
      }),
    };
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
    openReached('already');
    focus(byId('rsvpAlreadyHeading'));
  }

  function openInvitation(party) {
    if (party.replied) showAlready(party);
    else selectParty(party);
  }

  function withSheetToken(party) {
    return { ...party, token: `sheet:${party.id}` };
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

  function selectParty(party) {
    selectedParty = party;
    form.reset();
    members.replaceChildren();
    const heading = byId('partyHeading');
    const intro = heading.nextElementSibling;
    const namedGuests = party.members.filter((member) => !member.plusOne);
    const several = namedGuests.length > 1;
    const first = (namedGuests[0] || party.members[0]).name.trim().split(/\s+/)[0];
    heading.textContent = `${first}${/s$/i.test(first) ? '’' : '’s'} Party`;
    heading.hidden = !several;
    intro.hidden = !several && !party.members.some((member) => member.plusOne);
    party.members.forEach((member, index) => {
      const fieldset = document.createElement('fieldset');
      fieldset.className = 'party-member';
      const row = document.createElement('div');
      row.className = 'party-member__row';
      const name = document.createElement('span');
      name.id = `party-member-name-${index}`;
      name.className = 'party-member__name';
      name.tabIndex = -1;
      name.textContent = member.name;
      fieldset.setAttribute('aria-labelledby', name.id);
      const choices = document.createElement('div');
      choices.className = 'party-member__choices';
      [['no', 'Unable to attend'], ['yes', 'Attending']].forEach(([value, text]) => {
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
    openReached('confirm');
    focus(several ? heading : members.querySelector('.party-member__name'));
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
    const pieces = Array.from({ length: 72 }, () => {
      const angle = Math.random() * Math.PI * 2;
      const speed = 3.5 + Math.random() * 8;
      return {
        x: originX,
        y: originY,
        w: 5 + Math.random() * 5,
        h: 7 + Math.random() * 7,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        spin: Math.random() * Math.PI,
        spinV: -0.25 + Math.random() * 0.5,
        color: colors[Math.floor(Math.random() * colors.length)],
      };
    });
    const started = performance.now();
    const draw = (now) => {
      const width = canvas.width = window.innerWidth;
      const height = canvas.height = window.innerHeight;
      context.clearRect(0, 0, width, height);
      pieces.forEach((piece) => {
        piece.vy += 0.18;
        piece.x += piece.vx;
        piece.y += piece.vy;
        piece.vx *= 0.985;
        piece.spin += piece.spinV;
        context.save();
        context.translate(piece.x, piece.y);
        context.rotate(piece.spin);
        context.fillStyle = piece.color;
        context.fillRect(-piece.w / 2, -piece.h / 2, piece.w, piece.h);
        context.restore();
      });
      if (now - started < 2400) requestAnimationFrame(draw);
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
        if (!party) return;
        const invitation = withSheetToken(party);
        if (party.replied) selectParty(invitation);
        else openInvitation(invitation);
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

  async function loadStatus() {
    showStep('loading');
    try {
      const parties = await loadGuestList();
      showStep(parties.length ? 'search' : 'pending');
      if (parties.length) {
        openReached('find');
        renderSuggestions();
      }
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
    selectParty(withSheetToken(party));
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
      form.querySelector(`[name="attending-${missing}"]`)?.reportValidity();
      return;
    }
    const responses = repliesFromForm();
    const unnamedGuest = responses.find((response, index) => selectedParty.members[index].plusOne && response.attending && response.name.length < 2);
    if (unnamedGuest) {
      const field = form.querySelector(`[name="guest-name-${responses.indexOf(unnamedGuest)}"]`);
      field?.setCustomValidity('Add your guest’s name, or mark this plus one as unable to attend.');
      field?.reportValidity();
      return;
    }
    byId('rsvpWishesSummary').replaceChildren(...summaryItems(selectedParty, responses));
    openReached('note');
    focus(byId('rsvpWishesHeading'));
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy || !selectedParty || !form.reportValidity()) return;
    const responses = repliesFromForm();
    const unnamedGuest = responses.find((response, index) => selectedParty.members[index].plusOne && response.attending && response.name.length < 2);
    if (unnamedGuest) {
      const field = form.querySelector(`[name="guest-name-${responses.indexOf(unnamedGuest)}"]`);
      field?.setCustomValidity('Add your guest’s name, or mark this plus one as unable to attend.');
      field?.reportValidity();
      return;
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
      try {
        const data = await request(body);
        if (!data.saved) throw new Error('Missing save confirmation');
      } catch (error) {
        if (error.status && error.status !== 401 && error.status !== 503) throw error;
      }
      rememberReply(selectedParty, responses, body.wishes);
      savedReply = { party: selectedParty, responses, wishes: body.wishes };
      const anyoneAttending = responses.some((response) => response.attending);
      const confirmation = confirmationMessage(anyoneAttending);
      byId('rsvpSuccessMessage').textContent = confirmation.title;
      byId('rsvpSuccessDetail').textContent = confirmation.detail;
      byId('rsvpSummary').replaceChildren(...summaryItems(selectedParty, responses));
      showStep('success');
      focus(byId('rsvpSuccessHeading'));
      if (anyoneAttending) celebrate();
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
  loadStatus();
}
