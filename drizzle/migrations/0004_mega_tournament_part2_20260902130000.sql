create table if not exists public.mega_events (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null default 'USTAD AI Mega Tournament',
  status text not null default 'open',
  timezone text not null default 'Asia/Kolkata',
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null default (now() + interval '7 days'),
  question_count integer not null default 20,
  question_seconds integer not null default 45,
  pre_timer_seconds integer not null default 10,
  solo_question_count integer not null default 20,
  solo_total_seconds integer not null default 600,
  solo_required_correct integer not null default 10,
  max_players integer not null default 4,
  min_players integer not null default 2,
  pass_cost bigint not null default 40000000,
  category text not null default 'mixed',
  difficulty text not null default 'mixed',
  scoring jsonb not null default
    '{"correct":10,"wrong":0,"unanswered":0,"speedBonusMax":5,"tieBreak":["correct","time","joinedAt"]}'::jsonb,
  rewards jsonb not null default '{"winner":5000000,"runnerUp":1000000,"participation":100000,"soloWin":2000000}'::jsonb,
  rules jsonb not null default '{}'::jsonb,
  solo_enabled boolean not null default true,
  multiplayer_enabled boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists mega_events_window_idx on public.mega_events (status, starts_at, ends_at);

create table if not exists public.mega_passes (
  id uuid primary key default gen_random_uuid(),
  guest_id text not null references public.guests (id) on delete cascade,
  event_id uuid not null references public.mega_events (id) on delete cascade,
  cost bigint not null default 0,
  status text not null default 'active',
  purchased_at timestamptz not null default now(),
  valid_from timestamptz not null default now(),
  valid_until timestamptz not null,
  unique (guest_id, event_id)
);
create index if not exists mega_passes_guest_idx on public.mega_passes (guest_id, valid_until desc);

create table if not exists public.mega_lobby_presence (
  guest_id text primary key references public.guests (id) on delete cascade,
  event_id uuid not null references public.mega_events (id) on delete cascade,
  display_name text not null default '',
  state text not null default 'available',
  match_id uuid,
  last_seen_at timestamptz not null default now()
);
create index if not exists mega_lobby_event_idx on public.mega_lobby_presence (event_id, last_seen_at desc);

create table if not exists public.mega_matches (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.mega_events (id) on delete cascade,
  host_guest_id text not null references public.guests (id) on delete cascade,
  mode text not null default 'multiplayer',
  status text not null default 'lobby',
  question_count integer not null,
  current_question integer not null default 0,
  question_seconds integer not null default 45,
  presented_at timestamptz,
  answer_timer_starts_at timestamptz,
  question_deadline_at timestamptz,
  solo_deadline_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  winner_guest_id text references public.guests (id) on delete set null,
  tie_break_reason text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists mega_matches_event_idx on public.mega_matches (event_id, created_at desc);
create index if not exists mega_matches_host_idx on public.mega_matches (host_guest_id, created_at desc);
create unique index if not exists mega_matches_one_live_host
  on public.mega_matches (host_guest_id)
  where status in ('lobby', 'ready', 'active');

create table if not exists public.mega_match_players (
  match_id uuid not null references public.mega_matches (id) on delete cascade,
  guest_id text not null references public.guests (id) on delete cascade,
  display_name text not null default '',
  is_host boolean not null default false,
  state text not null default 'joining',
  correct_count integer not null default 0,
  wrong_count integer not null default 0,
  unanswered_count integer not null default 0,
  score integer not null default 0,
  total_response_ms bigint not null default 0,
  rank integer,
  fifty_fifty_used boolean not null default false,
  hint_used boolean not null default false,
  skip_used boolean not null default false,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (match_id, guest_id)
);

create table if not exists public.mega_match_questions (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.mega_matches (id) on delete cascade,
  event_id uuid not null references public.mega_events (id) on delete cascade,
  question_number integer not null,
  question text not null,
  options jsonb not null,
  correct_index integer not null,
  category text not null default 'General',
  difficulty text not null default 'medium',
  explanation text not null default '',
  hint text not null default '',
  resolved boolean not null default false,
  unique (match_id, question_number)
);

create table if not exists public.mega_match_answers (
  match_id uuid not null references public.mega_matches (id) on delete cascade,
  question_number integer not null,
  guest_id text not null references public.guests (id) on delete cascade,
  option_index integer,
  is_correct boolean not null default false,
  response_ms integer not null default 0,
  score_delta integer not null default 0,
  removed_options jsonb,
  hint_shown boolean not null default false,
  skipped boolean not null default false,
  answered_at timestamptz not null default now(),
  primary key (match_id, question_number, guest_id)
);

create table if not exists public.mega_match_results (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null unique references public.mega_matches (id) on delete cascade,
  event_id uuid not null references public.mega_events (id) on delete cascade,
  mode text not null,
  question_count integer not null,
  winner_guest_id text references public.guests (id) on delete set null,
  outcome text not null default '',
  standings jsonb not null default '[]'::jsonb,
  tie_break_reason text not null default '',
  started_at timestamptz,
  ended_at timestamptz,
  duration_ms bigint not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists mega_match_results_event_idx
  on public.mega_match_results (event_id, created_at desc);

create table if not exists public.mega_player_results (
  match_id uuid not null references public.mega_matches (id) on delete cascade,
  guest_id text not null references public.guests (id) on delete cascade,
  event_id uuid not null references public.mega_events (id) on delete cascade,
  mode text not null,
  rank integer not null default 0,
  is_winner boolean not null default false,
  correct_count integer not null default 0,
  wrong_count integer not null default 0,
  unanswered_count integer not null default 0,
  score integer not null default 0,
  total_response_ms bigint not null default 0,
  coins_awarded bigint not null default 0,
  outcome text not null default '',
  created_at timestamptz not null default now(),
  primary key (match_id, guest_id)
);
create index if not exists mega_player_results_guest_idx
  on public.mega_player_results (guest_id, created_at desc);

create table if not exists public.mega_served_questions (
  guest_id text not null references public.guests (id) on delete cascade,
  question_hash text not null,
  last_served_at timestamptz not null default now(),
  primary key (guest_id, question_hash)
);

insert into public.mega_events (code, title, starts_at, ends_at)
values (
  'mega-weekly',
  'USTAD AI Mega Tournament',
  date_trunc('week', now()),
  date_trunc('week', now()) + interval '7 days'
)
on conflict (code) do nothing;

grant all on public.mega_events to service_role;
grant all on public.mega_passes to service_role;
grant all on public.mega_lobby_presence to service_role;
grant all on public.mega_matches to service_role;
grant all on public.mega_match_players to service_role;
grant all on public.mega_match_questions to service_role;
grant all on public.mega_match_answers to service_role;
grant all on public.mega_match_results to service_role;
grant all on public.mega_player_results to service_role;
grant all on public.mega_served_questions to service_role;

alter table public.mega_events enable row level security;
alter table public.mega_passes enable row level security;
alter table public.mega_lobby_presence enable row level security;
alter table public.mega_matches enable row level security;
alter table public.mega_match_players enable row level security;
alter table public.mega_match_questions enable row level security;
alter table public.mega_match_answers enable row level security;
alter table public.mega_match_results enable row level security;
alter table public.mega_player_results enable row level security;
alter table public.mega_served_questions enable row level security;