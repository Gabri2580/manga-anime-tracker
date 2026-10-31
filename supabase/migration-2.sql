-- Aggiornamento 2: preferiti e aggiornamento automatico delle opere in corso.
-- Incolla nel SQL Editor di Supabase e premi Run. È sicuro rieseguirlo (usa "if not exists").
-- I dati esistenti non vengono toccati: i titoli attuali restano com'erano, con favorite = false.
alter table public.items add column if not exists favorite boolean not null default false;
alter table public.items add column if not exists anilist_status text;  -- RELEASING, FINISHED, HIATUS, ...
alter table public.items add column if not exists released int;         -- episodi già usciti (solo anime in corso)
