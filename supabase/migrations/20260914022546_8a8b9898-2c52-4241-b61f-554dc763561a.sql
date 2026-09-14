-- PART 9 — Notification Center + Activity History + Event Reminders

create table if not exists public.ustad_notifications (
  id uuid primary key default gen_random_uuid(),
  guest_id text not null references public.guests (id) on delete cascade,
  user_id uuid,
  type text not null,
  category text not null default 'system'
    check (category in ('events','coins','tournament','achievements',
                        'certificates','shop','system')),
  title text not null,
  message text not null default '',
  language text not null default 'english'
    check (language in ('english','hindi','hinglish')),
  reference_type text not null default '',
  reference_id text not null default '',
  action_path text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  is_read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  dedupe_key text not null
);

create unique index if not exists ustad_notifications_dedupe_uidx
  on public.ustad_notifications (guest_id, dedupe_key);

create index if not exists ustad_notifications_feed_idx
  on public.ustad_notifications (guest_id, created_at desc, id desc);

create index if not exists ustad_notifications_unread_idx
  on public.ustad_notifications (guest_id)
  where is_read = false;

create index if not exists ustad_notifications_category_idx
  on public.ustad_notifications (guest_id, category, created_at desc);

comment on table public.ustad_notifications is
  'Part 9 Notification Center. Single notification store; title/message are '
  'rendered at creation time in the language snapshot so history is stable.';

alter table public.ustad_notifications enable row level security;
grant all on public.ustad_notifications to service_role;

create table if not exists public.ustad_event_reminder_log (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.master_events (id) on delete cascade,
  guest_id text not null references public.guests (id) on delete cascade,
  reminder_kind text not null
    check (reminder_kind in ('reminder_3d','reminder_2d','reminder_1d','live')),
  fired_at timestamptz not null default now(),
  unique (event_id, guest_id, reminder_kind)
);

create index if not exists ustad_event_reminder_log_event_idx
  on public.ustad_event_reminder_log (event_id, reminder_kind);

alter table public.ustad_event_reminder_log enable row level security;
grant all on public.ustad_event_reminder_log to service_role;

insert into public.ustad_notifications
  (guest_id, type, category, title, message, language,
   reference_type, reference_id, metadata, is_read, created_at, dedupe_key)
select
  r.guest_id,
  'system',
  case
    when r.payload ->> 'kind' like 'coin%' or r.payload ? 'amount' then 'coins'
    when r.title ilike '%certificate%' then 'certificates'
    when r.title ilike '%trophy%' or r.title ilike '%achievement%'
      or r.title ilike '%grandmaster%' then 'achievements'
    when r.title ilike '%shop%' or r.title ilike '%unlock%' then 'shop'
    when r.title ilike '%event%' then 'events'
    when r.title ilike '%crorepati%' or r.title ilike '%mega%'
      or r.title ilike '%tournament%' then 'tournament'
    else 'system'
  end,
  r.title,
  coalesce(r.note, ''),
  'english',
  'legacy',
  r.id::text,
  coalesce(r.payload, '{}'::jsonb),
  true,
  r.created_at,
  'legacy:' || r.id::text
from public.reminders r
where r.kind = 'notification'
  and exists (select 1 from public.guests g where g.id = r.guest_id)
on conflict (guest_id, dedupe_key) do nothing;