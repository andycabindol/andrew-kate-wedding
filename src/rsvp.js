import { weddingConfig } from './wedding-config.js';

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
  let selectedParty = null;
  let busy = false;

  function showStep(step) {
    ['Loading', 'Pending', 'Search', 'Confirm', 'Success', 'Unavailable'].forEach((name) => {
      byId(`rsvp${name}Step`).hidden = name.toLowerCase() !== step;
    });
    status.textContent = '';
  }
  const focus = (el) => el.focus({ preventScroll: true });

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
    byId('partyHeading').textContent = party.label;
    party.members.forEach((member, index) => {
      const fieldset = document.createElement('fieldset');
      fieldset.className = 'party-member';
      const legend = document.createElement('legend');
      legend.className = 'party-member__name';
      legend.textContent = member.name;
      const choices = document.createElement('div');
      choices.className = 'party-member__choices';
      [['yes', 'Attending'], ['no', 'Unable to attend']].forEach(([value, text]) => {
        const label = document.createElement('label');
        label.className = 'party-member__choice';
        const radio = document.createElement('input');
        Object.assign(radio, { type: 'radio', name: `attending-${index}`, value, required: true });
        const caption = document.createElement('span');
        caption.textContent = text;
        label.append(radio, caption);
        choices.append(label);
      });
      fieldset.append(legend, choices);
      members.append(fieldset);
    });
    showStep('confirm');
    focus(byId('partyHeading'));
  }

  function reset() {
    selectedParty = null;
    form.reset();
    results.replaceChildren();
    results.hidden = true;
    showStep('search');
    focus(input);
  }

  async function loadStatus() {
    showStep('loading');
    try {
      const data = await request({ action: 'status' });
      showStep(data.open ? 'search' : 'pending');
    } catch {
      showStep('unavailable');
    }
  }

  searchForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy || !searchForm.reportValidity()) return;
    busy = true;
    const button = searchForm.querySelector('button');
    button.disabled = true;
    input.readOnly = true;
    button.textContent = 'Finding…';
    results.replaceChildren();
    results.hidden = true;
    status.textContent = 'Finding your invitation…';
    try {
      const data = await request({ action: 'search', name: input.value.trim() });
      if (!data.open) {
        showStep('pending');
      } else if (!data.parties.length) {
        status.textContent = 'We couldn’t find that name. Try your full name as it appears on the invitation, or get in touch below.';
      } else if (data.parties.length === 1) {
        selectParty(data.parties[0]);
      } else {
        status.textContent = 'Please select your invitation.';
        data.parties.forEach((party) => {
          const li = document.createElement('li');
          const option = document.createElement('button');
          option.type = 'button';
          option.className = 'guest-results__item';
          option.textContent = party.label;
          option.addEventListener('click', () => selectParty(party));
          li.append(option);
          results.append(li);
        });
        results.hidden = false;
        focus(results.querySelector('button'));
      }
    } catch (error) {
      status.textContent = errorMessage(error);
    } finally {
      busy = false;
      button.disabled = false;
      input.readOnly = false;
      button.textContent = 'Find invitation';
    }
  });

  input.addEventListener('input', () => {
    results.hidden = true;
    status.textContent = '';
  });
  byId('changePartyBtn').addEventListener('click', reset);
  byId('rsvpAgain').addEventListener('click', reset);
  byId('rsvpRetry').addEventListener('click', loadStatus);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy || !selectedParty || !form.reportValidity()) return;
    const values = new FormData(form);
    const responses = selectedParty.members.map((member, index) => ({
      id: member.id, attending: values.get(`attending-${index}`) === 'yes',
    }));
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
      byId('rsvpSummary').replaceChildren(...responses.map((response, index) => {
        const row = document.createElement('li');
        const name = document.createElement('span');
        name.textContent = selectedParty.members[index].name;
        const answer = document.createElement('span');
        answer.textContent = response.attending ? 'Attending' : 'Unable to attend';
        row.append(name, answer);
        return row;
      }));
      showStep('success');
      focus(byId('rsvpSuccessHeading'));
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
