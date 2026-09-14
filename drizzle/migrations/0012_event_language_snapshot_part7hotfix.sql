-- Part 7 hotfix — per-attempt language snapshot

alter table public.crorepati_attempts
  add column if not exists language text;

update public.crorepati_attempts a
set language = coalesce(s.language, 'english')
from public.settings s
where s.guest_id = a.guest_id
  and a.language is null;

update public.crorepati_attempts
set language = 'english'
where language is null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'crorepati_attempts_language_check') then
    alter table public.crorepati_attempts
      add constraint crorepati_attempts_language_check
      check (language in ('english', 'hindi', 'hinglish')) not valid;
  end if;
end $$;

alter table public.master_event_attempts
  add column if not exists language text;

update public.master_event_attempts a
set language = coalesce(s.language, 'english')
from public.settings s
where s.guest_id = a.guest_id
  and a.language is null;

update public.master_event_attempts
set language = 'english'
where language is null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'master_event_attempts_language_check') then
    alter table public.master_event_attempts
      add constraint master_event_attempts_language_check
      check (language in ('english', 'hindi', 'hinglish')) not valid;
  end if;
end $$;