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

## Database changes

The database blueprint lives in `supabase/migrations/`. Each file runs once, in order of the timestamp in its name. To apply new ones to the online database:

```
npx supabase db push
```
