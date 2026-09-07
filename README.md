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

No invitation list has been loaded. The site automatically displays **RSVPs opening
soon** while the invitation table is empty. The former example guest list has been
removed from public assets and is retained only as `docs/guests.example.json`.

### Loading the final guest list

1. Copy `docs/guests.example.json` to a private location and replace every example.
   Each party has a stable `id`, a `label`, and `members` with stable IDs and full names.
   Include children and additional guests as individual members of the invitation.
   Every name must be at least three characters; use the full name as printed on the invite.
2. Validate without uploading:
   `npm run guests:import -- /absolute/path/to/guests.json --check`
3. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in your shell using the project’s
   URL and server-only service role key, then run:
   `npm run guests:import -- /absolute/path/to/guests.json`

The importer upserts invitations in one database request, validates IDs and names,
and generates lookup names. Re-importing the same IDs updates those invitations;
omitted invitations are not deleted. Keep IDs stable to preserve associated replies.
Do not import the example list into production. Never put a real guest list in
`public/`, and never put a service-role key into a `VITE_` variable or commit it.

### Guest flow and access model

Guests enter their full invited name (case-, accent- and whitespace-insensitive).
For matching names on multiple invitations they choose their party. Name lookup
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
`docs/photo-sources.json`; small source links appear below each carousel. The
pavilion photograph depicts winter. Engagement photos are unchanged.

## Backend source and deployment

Schema: `supabase/migrations/20260907224950_wedding_rsvp.sql`.
Edge Function: `supabase/functions/wedding-rsvp/`.
`supabase/config.toml` disables the platform JWT gate because guests do not log in;
the handler verifies its own signed invitation token for writes. Runtime
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provisioned by Supabase.

Run `npm test` for validation, token, persistence-failure, update, import, and
rate-limit behavior. Live verification uses a temporary invitation and removes
its replies and invitation afterward; no example guests are retained.
