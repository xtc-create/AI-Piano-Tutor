# Piano Tutor

Interactive browser piano with guided falling-note lessons, timing feedback, recordings, optional MIDI input, and optional Gemini coaching.

## Run locally

```bash
npm install
npm run dev
```

Open `/` for the landing page, `/login` or `/signup` for account access, and `/practice` to begin immediately as a guest.

## Computer keyboard map

The on-screen key labels are intentionally hidden during practice. These controls remain active:

| Computer key | Piano note |
| --- | --- |
| A W S E D | C4 C#4 D4 D#4 E4 |
| F T G Y H U J K | F4 F#4 G4 G#4 A4 A#4 B4 C5 |

## AI coaching

Add `GEMINI_API_KEY` to `.env.local` to enable the post-lesson coaching endpoint. The app sends measured timing results (accuracy, average early/late offset, and late-note count) for a short practice recommendation.

## Supabase

The current demo account/history storage is local to the browser. The database schema for production is ready in [`supabase/schema.sql`](supabase/schema.sql).

1. Copy `.env.example` to `.env.local` and add fresh values from your Supabase project. Do not commit `.env.local`.
2. In Supabase SQL Editor, run `supabase/schema.sql` once.
3. In Supabase Dashboard → Authentication → Users, choose **Add user**, enter the test email and password, and choose whether to auto-confirm the email. The database trigger creates that user’s profile automatically.
4. Add sample history only after the user exists: get their UUID from Authentication → Users, then insert rows into `public.sequences` and `public.sequence_notes` using that UUID as `user_id`.

Use the project **publishable/anon key** in browser configuration only. Never put a service-role/secret key in the client or repository. The current local login screen is still a demo; the next implementation step is replacing that local storage flow with Supabase Auth calls.
