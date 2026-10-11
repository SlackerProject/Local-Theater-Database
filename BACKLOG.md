# Backlog

## Next

- **Want to see** (production pages) and **Follow** (person and company pages). The design shows both; the database tables exist (`watch_list`, `follows`), but the buttons are hidden until the features are built.
- **Suggest an edit** links (production cast list, person pages). Hidden until there's an edit-suggestion flow.
- **Clean up unused uploads.** A poster uploaded on the Add a production form is stored immediately; if the draft is abandoned, or the submission is rejected and never resubmitted, the file stays in storage. A periodic cleanup of files no media row or open submission refers to would reclaim space.

## Milestone 5

- **Email notifications** for page owners (changes to their page, claim verified or rejected). In-app notifications exist; email waits for the custom domain and email service.

## Claiming follow-ups

- Let a claimant withdraw a pending claim (today a moderator rejects it).
- Tell a claimant in-app when their claim is verified or rejected (today they find out by visiting the page).
- "Undo the change" covers credits, page edits and approved uploads; other kinds of disputed change are marked resolved and fixed by hand.

## Before public launch

- **Merge duplicate people.** A moderator tool to combine two person pages that are the same person, moving all credits to one.
- **Time zone per venue.** Performance times are currently treated as Massachusetts time (America/New_York) everywhere.
- **Custom domain, then an email service.** Supabase's built-in email only sends a few messages an hour, and only to the project team, so public sign-up confirmations need a proper email service once the domain is set up.
- **Watch storage and bandwidth.** The free plan includes 1 GB of storage (about 3,000 images at ~340 KB each) and 5 GB of bandwidth a month. Check usage in the Supabase dashboard (Project Settings > Usage) as photos come in.

## Suggested, not yet decided

- A short privacy page explaining that email addresses are stored only for sign-in.
- Pagination for the Shows, People and Companies lists once they grow past a few thousand entries.
- Raise or remove the 40-photos-per-production limit once storage use is known.
- Photo captions (the database and viewer support them; the upload form doesn't ask yet).

## Later milestones

- Person page extras: claim this page, bio and links editing.
- Awards (EMACT nominations and wins); every page shows an empty Awards section for now.
