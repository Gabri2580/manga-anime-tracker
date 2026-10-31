-- Incolla tutto nel SQL Editor di Supabase e premi Run. Si può rieseguire solo su un progetto vuoto.

-- ===== Profili (uno per utente, creato in automatico alla creazione dell'account) =====
create table public.profiles (
  id   uuid primary key references auth.users on delete cascade,
  name text not null
);
alter table public.profiles enable row level security;
create policy "profiles: leggono tutti gli utenti" on public.profiles for select to authenticated using (true);
create policy "profiles: modifichi solo il tuo"    on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ===== Titoli (manga, manhwa, novel, anime) =====
create table public.items (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  kind       text not null check (kind in ('manga','manhwa','novel','anime')),
  title      text not null,
  status     text not null default 'planned' check (status in ('planned','doing','done','dropped')),
  progress   int  not null default 0 check (progress >= 0),   -- episodi visti / volumi letti
  total      int  check (total >= 0),                         -- episodi o volumi totali
  owned      text not null default '',                        -- manga/manhwa/novel: "1-12, 15"; anime: '1' se posseduto
  score      numeric(3,1) check (score between 0 and 10),
  review     text not null default '',
  anilist_id int,
  cover_url  text,                                            -- originale AniList (per riprovare)
  cover_path text,                                            -- copia nel bucket "covers"
  favorite   boolean not null default false,                  -- (migration-2)
  anilist_status text,                                        -- (migration-2) stato su AniList
  released   int,                                             -- (migration-2) episodi usciti
  created_at timestamptz not null default now()
);
create unique index items_unique_anilist on public.items (user_id, kind, anilist_id) where anilist_id is not null;
create index items_user on public.items (user_id);
alter table public.items enable row level security;
-- Tutti gli utenti loggati leggono tutto; scrive solo il proprietario.
create policy "items: leggono tutti"       on public.items for select to authenticated using (true);
create policy "items: inserisci i tuoi"    on public.items for insert to authenticated with check (user_id = auth.uid());
create policy "items: modifichi i tuoi"    on public.items for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "items: cancelli i tuoi"     on public.items for delete to authenticated using (user_id = auth.uid());

-- ===== Zona comune: consigli =====
create table public.recs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  kind       text not null check (kind in ('manga','manhwa','novel','anime')),
  title      text not null,
  total      int,
  note       text not null default '',
  anilist_id int,
  cover_url  text,
  cover_path text,
  created_at timestamptz not null default now()
);
alter table public.recs enable row level security;
create policy "recs: leggono tutti"     on public.recs for select to authenticated using (true);
create policy "recs: inserisci i tuoi"  on public.recs for insert to authenticated with check (user_id = auth.uid());
create policy "recs: modifichi i tuoi"  on public.recs for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "recs: cancelli i tuoi"   on public.recs for delete to authenticated using (user_id = auth.uid());

-- ===== Copertine (bucket pubblico in lettura, scrittura solo nella propria cartella <user_id>/) =====
insert into storage.buckets (id, name, public) values ('covers', 'covers', true) on conflict (id) do nothing;
create policy "covers: select"        on storage.objects for select to authenticated using (bucket_id = 'covers');
create policy "covers: insert proprie" on storage.objects for insert to authenticated
  with check (bucket_id = 'covers' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "covers: update proprie" on storage.objects for update to authenticated
  using (bucket_id = 'covers' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'covers' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "covers: delete proprie" on storage.objects for delete to authenticated
  using (bucket_id = 'covers' and (storage.foldername(name))[1] = auth.uid()::text);
