# Local Theater Database

A public, crowdsourced database of local community theater.

Built with Next.js (App Router, TypeScript), Tailwind CSS and Supabase, hosted on Vercel.

## Run it on your computer

1. Open a terminal in this folder.
2. The first time only, install the code libraries:
   ```
   npm install
   ```
3. Make sure `.env.local` has both Supabase values filled in (see below).
4. Start the site:
   ```
   npm run dev
   ```
5. Open http://localhost:3000 in your browser. Press Ctrl + C in the terminal to stop.

## Settings (`.env.local`)

This file stays on your computer and is never uploaded to GitHub.

| Setting | Where to find it in the Supabase dashboard |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project Settings > Data API > Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Project Settings > API Keys > Publishable key (`sb_publishable_...`) |

The same two values are also set in Vercel (Project > Settings > Environment Variables) for the live site.

## Pages

| Address | What it is |
|---|---|
| `/` | Home: show count and recently added productions |
| `/signup`, `/signin` | Accounts (email and password, 18+ required) |
| `/add` | "Add a production" form (members only) |
| `/moderate` | Pending submissions with Approve and Reject (moderators and admins) |
| `/production/[slug]` | A production: cast, crew and performances |
| `/person/[slug]` | A person: stage credits and frequent collaborators |

## How submissions work

The whole "Add a production" form is saved as one pending row in `edit_proposals` (`entity_table = 'production_submission'`). When a moderator approves it, the database function `approve_submission()` creates the show, company, location, production, performances, people and credits in one go. If anything is wrong, nothing is created. The contributor earns points automatically.

## Database changes

The database blueprint lives in `supabase/migrations/`. Each file runs once, in order of the timestamp in its name. To apply new ones to the online database:

```
npx supabase db push
```

After changing the database, refresh the code's description of it:

```
npm run db:types
```
