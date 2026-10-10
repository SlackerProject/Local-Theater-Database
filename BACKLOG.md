# Backlog

## Next

- **Poster upload and show colors.** Storage for poster images, an upload box on the Add a production form, and reading the poster's colors in the browser as it's uploaded (`extractColors` and `derivePalette` in `lib/palette.ts` are ready). The color columns already exist (migration 0006); pages fall back to the plain black-and-white look until a production has a palette. Moderators should see the poster before approving.
- **Want to see** (production pages) and **Follow** (person and company pages). The design shows both; the database tables exist (`watch_list`, `follows`), but the buttons are hidden until the features are built.
- **Suggest an edit** links (production cast list, person pages). Hidden until there's an edit-suggestion flow.

## Before public launch

- **Merge duplicate people.** A moderator tool to combine two person pages that are the same person, moving all credits to one.
- **Time zone per venue.** Performance times are currently treated as Massachusetts time (America/New_York) everywhere.
- **Custom domain, then an email service.** Supabase's built-in email only sends a few messages an hour, and only to the project team, so public sign-up confirmations need a proper email service once the domain is set up.

## Suggested, not yet decided

- A short privacy page explaining that email addresses are stored only for sign-in.
- Pagination for the Shows, People and Companies lists once they grow past a few thousand entries.

## Later milestones

- Production photos (the Photos section shows an empty state for now).
- Person page extras: claim this page, headshots, bio and links editing.
- Awards (EMACT nominations and wins); every page shows an empty Awards section for now.
