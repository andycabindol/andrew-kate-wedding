# Katie & Andrew Wedding Website

Vite + vanilla HTML/CSS/JavaScript, with RSVP storage in Supabase.

## Development

```sh
npm install
npm run dev
npm test
npm run build
```

The existing design and static-site architecture are preserved. RSVP calls the
Supabase Edge Function configured in `src/wedding-config.js`; it does not need a
secret key in the browser. The built site lives in `dist/`.

## RSVP

The dedicated **Katie & Andrew Wedding** Supabase project is
`uyhzqldiukfmugasiapi` (US East, Ohio). Tables:

- `wedding_invitations`: invitation label, invited members, normalized lookup names.
- `wedding_rsvps`: one current response per invitation, attendance per guest, wishes, timestamp.
- `wedding_rate_limits`: temporary keyed hashes for lookup/submission rate limiting.

View or export replies from the Supabase Table Editor:
https://supabase.com/dashboard/project/uyhzqldiukfmugasiapi/editor

No real invitation list has been loaded. A manual test invitation is currently
available: search **Test Guest**, reply for Test Guest and Test Plus One, and check
`wedding_rsvps` in the Table Editor. Its invitation ID is `manual-rsvp-test-only`.
These are real database writes. Remove that invitation’s response first and then
the invitation after testing. The site automatically displays **RSVPs opening
soon** while the invitation table is empty. The former example guest list has been
removed from public assets and is retained only as `docs/guests.example.json`.

### Guest list in Google Sheets

The couple edits one Google Sheet. The website reads it, so a new guest or nickname
is available on the next lookup. Same last names stay separate because each
invitation has its own `party_id`, not because of the surname.

The guest sheet is [Katie x Andrew Wedding Guests](https://docs.google.com/spreadsheets/d/1sV27HMCN8Ed9fL3sgCSeqNR4RhjGQ3alWkBz6gbONhY/edit?usp=sharing).

1. Import `docs/rsvp-guests.template.csv` if the header row is missing. Add one row per named guest.
2. One row per named guest. Use a stable `party_id` for the invitation, even when
   another household shares the last name (`cabindol-andrew` and `cabindol-parents`).
3. `party_name` is what guests see if more than one invitation matches.
4. `also_known_as` is optional nicknames, separated by commas (`Andy Cabindol, Andy`).
   Common nicknames such as Andrew/Andy are also recognized when the last name matches.
   A small misspelling of an otherwise matching name is accepted.
5. `extra_guests` is the number of unnamed plus ones for that invitation. Enter it
   once on any row of the party. Guests reply for every person, and name a plus one
   if that person is attending.
6. Share the sheet as “Anyone with the link can view,” then copy the published CSV
   link (File → Share → Publish to web → Guests → CSV).
7. In the Supabase Edge Function secrets, set `RSVP_SHEET_CSV_URL` to that link.
   Lookups refresh from the sheet about every 45 seconds.

To write the RSVP checkbox back into the sheet:

1. Extensions → Apps Script, paste `docs/rsvp-sheet.gs`, and save.
2. Project Settings → Script properties → add `RSVP_SHEET_SECRET` with a long random value.
3. Deploy → New deployment → Web app. Execute as yourself, access “Anyone.”
4. Set the same secret as `RSVP_SHEET_SECRET` and the web app URL as `RSVP_SHEET_URL`
   on the Edge Function, then redeploy `wedding-rsvp`.

The script checks `rsvp_received` and fills `attending`, plus-one names, wishes, and
`replied_at`. Replies are still stored in Supabase if the sheet cannot be updated.
Do not put the secret or a service-role key in the website.

The JSON importer remains available for a one-time load:
`npm run guests:import -- /absolute/path/to/guests.json`

### Guest flow and access model

Guests enter an invited name, nickname, or close spelling. A last name that matches
more than one invitation asks them to choose the party. Name lookup
issues a signed 30-minute token scoped to that invitation. The server validates
that every invited member has exactly one boolean answer before atomically saving
the party’s response and wishes. Repeated submission replaces that party’s current
reply. Existing wishes and replies are never returned by name search.

This deliberately uses the requested name-based check-in, not proof of identity:
anyone who knows an invited full name can submit a reply for that invitation.
There is no email/password step. If stronger identity verification is needed later,
add unique invitation codes or email verification.

Direct anonymous/authenticated access to all RSVP tables is revoked, RLS is enabled,
and the Edge Function alone uses its server-side service role key. No browser keys
or secrets are needed. The public search and submission endpoints are limited to
30 attempts per 10 minutes per hashed source address. The status endpoint reveals
only whether invitations exist. Supabase’s informational “RLS enabled, no policy”
notices are intentional: public clients have no table access.

Submissions are stored in Supabase; no email notifications are sent.

## Content

`src/wedding-config.js` centralizes the RSVP deadline and registry links. The date
is **October 30, 2026**, interpreting the supplied October 30 as the date before the
May 29, 2027 wedding. The HTML includes the same fallback date for initial rendering.
The Knot is the only supplied registry; add direct Amazon/Target URLs to the
registries array when ready. No empty or generic-store links are shown.

Venue photos are verified against RDG Planning & Design (church) and Raspberry
Hill’s official website (reception). Source URLs and asset details are recorded in
`docs/photo-sources.json`. The
pavilion photograph depicts winter. Engagement photos are unchanged.

## Backend source and deployment

Schema: `supabase/migrations/20260907224950_wedding_rsvp.sql`.
Edge Function: `supabase/functions/wedding-rsvp/`.
`supabase/config.toml` disables the platform JWT gate because guests do not log in;
the handler verifies its own signed invitation token for writes. Runtime
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provisioned by Supabase.

Run `npm test` for validation, token, persistence-failure, update, import, and
rate-limit behavior. Live verification uses a temporary invitation and removes
its replies and invitation afterward. The separate manual test invitation described
above remains available for owner testing until explicitly removed.
