# KOOTU — Go Live & Database Setup Guide (Updated)

This guide walks you through setting up your free Supabase cloud database to support **real-time chat, live mentor profiles, match tracking, and photo storage**.

Total time: ~10 minutes. Everything is **100% free**.

---

## Part 1 — Create your free Supabase Project

1. Go to **https://supabase.com** and click **Start your project** (sign in with GitHub or email).
2. Click **New project**:
   - **Name:** `kootu`
   - **Database password:** Enter a secure password (save it safely).
   - **Region:** Pick the closest region (e.g. *South Asia - Mumbai*).
   - Click **Create new project** and wait ~2 minutes.

---

## Part 2 — Create the Complete Database Schema

1. In your Supabase project dashboard, click **SQL Editor** (left sidebar) → **New query**.
2. Paste the SQL script below and click **Run** (bottom right):

```sql
-- 1. Colleges
create table if not exists colleges (
  id bigint generated always as identity primary key,
  name text not null unique,
  created_at timestamptz default now()
);

-- 2. Mentors
create table if not exists mentors (
  id bigint generated always as identity primary key,
  name text not null,
  email text unique not null,
  college text not null,
  branch text,
  year text,
  gender text,
  capacity int default 2,
  linkedin text,
  photo text,
  skills jsonb,
  qual text,
  ach jsonb,
  bio text,
  pct int default 92,
  created_at timestamptz default now()
);

-- 3. Matches
create table if not exists matches (
  id bigint generated always as identity primary key,
  junior_name text not null,
  junior_email text not null,
  college text not null,
  mentor_name text not null,
  mentor_email text not null,
  mentor_id bigint references mentors(id) on delete set null,
  status text default 'active', -- active | ended
  started_at timestamptz default now(),
  created_at timestamptz default now()
);

-- 4. Real-time Messages (Two-way chat)
create table if not exists messages (
  id bigint generated always as identity primary key,
  match_id bigint references matches(id) on delete cascade,
  sender_email text not null,
  sender_name text not null,
  sender_role text not null, -- 'mentor' | 'junior'
  content text not null,
  created_at timestamptz default now()
);

-- 5. Juniors (store profiles and credentials in the cloud)
create table if not exists juniors (
  id bigint generated always as identity primary key,
  name text not null,
  email text unique not null,
  college text not null,
  pass_hash text,
  created_at timestamptz default now()
);

-- Enable Row Level Security
alter table colleges enable row level security;
alter table mentors  enable row level security;
alter table matches  enable row level security;
alter table messages enable row level security;
alter table juniors  enable row level security;

-- Policies for public campus access
create policy "allow select colleges" on colleges for select using (true);
create policy "allow insert colleges" on colleges for insert with check (true);

create policy "allow select mentors"  on mentors  for select using (true);
create policy "allow insert mentors"  on mentors  for insert with check (true);
create policy "allow update mentors"  on mentors  for update using (true);

create policy "allow select matches"  on matches  for select using (true);
create policy "allow insert matches"  on matches  for insert with check (true);
create policy "allow update matches"  on matches  for update using (true);

create policy "allow select messages" on messages for select using (true);
create policy "allow insert messages" on messages for insert with check (true);

create policy "allow select juniors"  on juniors  for select using (true);
create policy "allow insert juniors"  on juniors  for insert with check (true);
create policy "allow update juniors"  on juniors  for update using (true);
```

You should see **"Success. No rows returned."**

---

## Part 3 — Enable Realtime for Live Chat

To allow mentors and juniors to chat in real-time without refreshing:
1. In Supabase, go to **Database** (left sidebar) → **Replication**.
2. Find the **messages** table and toggle **Source** to enabled (Green checkmark).
3. Alternatively, run this in SQL Editor:
   ```sql
   alter publication supabase_realtime add table messages;
   ```

---

## Part 4 — Enable Avatar Storage (Optional but Recommended)

To store profile photos in Supabase Storage instead of database rows:
1. Go to **Storage** (left sidebar) → **New bucket**.
2. **Name:** `avatars`
3. Toggle **Public bucket** to **ON**.
4. Click **Save**.

---

## Part 5 — Connect Your App

1. In Supabase, go to **Project Settings** (gear icon) → **API**.
2. Copy two values:
   - **Project URL** (e.g. `https://abcdefghijklmn.supabase.co`)
   - **anon public key** (the long JWT key)
3. Open `script.js` in your editor. Near line 8, replace the placeholders:
   ```javascript
   const SUPABASE_URL = "https://your-project.supabase.co";
   const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...";
   ```
4. Save `script.js`.

---

## Part 6 — Deploy Online for Free

You can deploy your project to **Netlify**, **Vercel**, or **GitHub Pages**:

### Option A: Netlify Drop (Fastest, No install)
1. Go to **https://app.netlify.com/drop**
2. Drag and drop your `KOOTU` project folder (containing `index.html`, `script.js`, `style.css`, `logo.png`, `manifest.json`, `sw.js`).
3. Netlify will give you a live HTTPS link (e.g., `https://kootu-campus.netlify.app`) to share with students!

### Option B: GitHub Pages
1. Push your files to a GitHub repository.
2. Go to **Settings** → **Pages** → select `main` branch → **Save**.
