-- Run this in Supabase SQL Editor before wiring the app to Supabase Auth.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.sequences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  created_at timestamptz not null default now(),
  duration_ms integer not null check (duration_ms >= 0)
);

create table if not exists public.sequence_notes (
  id bigint generated always as identity primary key,
  sequence_id uuid not null references public.sequences(id) on delete cascade,
  type text not null check (type in ('note_on', 'note_off')),
  note text not null,
  velocity integer not null check (velocity between 0 and 127),
  source text not null check (source in ('mouse', 'keyboard', 'midi', 'replay')),
  time_ms numeric not null check (time_ms >= 0)
);

alter table public.profiles enable row level security;
alter table public.sequences enable row level security;
alter table public.sequence_notes enable row level security;

create policy "Users can read their profile" on public.profiles for select using (auth.uid() = id);
create policy "Users can update their profile" on public.profiles for update using (auth.uid() = id);
create policy "Users can manage their sequences" on public.sequences for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can manage notes in their sequences" on public.sequence_notes for all using (
  exists (select 1 from public.sequences where sequences.id = sequence_notes.sequence_id and sequences.user_id = auth.uid())
) with check (
  exists (select 1 from public.sequences where sequences.id = sequence_notes.sequence_id and sequences.user_id = auth.uid())
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name) values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();
