-- USTAD AI core baseline (guests, chat, attachments, exams, idempotency)
create extension if not exists pgcrypto;

create table if not exists public.guests (
  id text primary key,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table if not exists public.profiles (
  guest_id text primary key references public.guests(id) on delete cascade,
  name text,
  age numeric,
  klass text,
  board text,
  education text,
  interests text,
  learning_preferences text,
  language text not null default 'hi',
  updated_at timestamptz not null default now()
);

create table if not exists public.settings (
  guest_id text primary key references public.guests(id) on delete cascade,
  language text not null default 'hi',
  theme text not null default 'system',
  timezone text,
  auto_speak boolean not null default false,
  data_saver boolean not null default false,
  web_search boolean not null default false,
  voice jsonb not null default '{}'::jsonb,
  extras jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.api_configs (
  id uuid primary key default gen_random_uuid(),
  guest_id text not null references public.guests(id) on delete cascade,
  provider text not null,
  config jsonb not null default '{}'::jsonb,
  models jsonb not null default '[]'::jsonb,
  status text not null default 'unknown',
  status_detail text,
  healthy boolean,
  latency_ms numeric,
  last_tested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (guest_id, provider)
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  guest_id text not null references public.guests(id) on delete cascade,
  title text not null default 'New chat',
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists conversations_guest_idx on public.conversations (guest_id, updated_at desc);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  guest_id text not null references public.guests(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role text not null,
  content text not null default '',
  attachments jsonb not null default '[]'::jsonb,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists messages_conversation_idx on public.messages (conversation_id, created_at asc);

create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  guest_id text not null references public.guests(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  kind text not null default 'file',
  name text not null default '',
  mime text not null default '',
  size numeric not null default 0,
  data text not null default '',
  extracted_text text,
  created_at timestamptz not null default now()
);
create index if not exists attachments_guest_idx on public.attachments (guest_id, created_at desc);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  guest_id text not null references public.guests(id) on delete cascade,
  title text not null default '',
  content text not null default '',
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.memories (
  id uuid primary key default gen_random_uuid(),
  guest_id text not null references public.guests(id) on delete cascade,
  kind text not null default 'fact',
  content text not null default '',
  source text not null default 'chat',
  created_at timestamptz not null default now()
);

create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  guest_id text not null references public.guests(id) on delete cascade,
  title text not null default '',
  note text,
  kind text not null default 'once',
  due_at timestamptz not null default now(),
  repeat_rule text not null default 'none',
  done boolean not null default false,
  notified_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists reminders_due_idx on public.reminders (due_at asc);

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  guest_id text not null references public.guests(id) on delete cascade,
  title text not null default '',
  details text,
  progress numeric not null default 0,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  guest_id text not null references public.guests(id) on delete cascade,
  topic text not null default '',
  level text not null default 'beginner',
  language text not null default 'hi',
  content jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.request_idempotency (
  id uuid primary key default gen_random_uuid(),
  guest_id text not null references public.guests(id) on delete cascade,
  kind text not null,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.exam_batches (
  id uuid primary key default gen_random_uuid(),
  guest_id text not null references public.guests(id) on delete cascade,
  title text not null default '',
  student_name text not null default '',
  father_name text,
  mother_name text,
  village text,
  district text,
  board text,
  klass text not null default '',
  language text not null default 'hi',
  difficulty text not null default 'medium',
  question_type text not null default 'mcq',
  duration_minutes numeric not null default 60,
  negative_marking numeric not null default 0,
  subjects jsonb not null default '[]'::jsonb,
  timezone text not null default 'Asia/Kolkata',
  status text not null default 'scheduled',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.exams (
  id uuid primary key default gen_random_uuid(),
  guest_id text not null references public.guests(id) on delete cascade,
  batch_id uuid references public.exam_batches(id) on delete cascade,
  topic text not null default '',
  subject text,
  klass text,
  language text not null default 'hi',
  difficulty text not null default 'medium',
  question_type text not null default 'mcq',
  duration_minutes numeric not null default 60,
  max_marks numeric not null default 0,
  negative_marking numeric not null default 0,
  questions jsonb not null default '[]'::jsonb,
  config jsonb not null default '{}'::jsonb,
  status text not null default 'draft',
  sort_order numeric not null default 0,
  scheduled_at timestamptz,
  delivered_at timestamptz,
  started_at timestamptz,
  ends_at timestamptz,
  generation_error text,
  timezone text not null default 'Asia/Kolkata',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists exams_guest_idx on public.exams (guest_id, created_at desc);

create table if not exists public.exam_sessions (
  id uuid primary key default gen_random_uuid(),
  guest_id text not null references public.guests(id) on delete cascade,
  exam_id uuid not null references public.exams(id) on delete cascade,
  answers jsonb not null default '{}'::jsonb,
  current_index numeric not null default 0,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null default now(),
  submitted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.exam_results (
  id uuid primary key default gen_random_uuid(),
  guest_id text not null references public.guests(id) on delete cascade,
  exam_id uuid not null references public.exams(id) on delete cascade,
  batch_id uuid references public.exam_batches(id) on delete cascade,
  subject text,
  answers jsonb not null default '{}'::jsonb,
  details jsonb not null default '[]'::jsonb,
  score numeric not null default 0,
  total numeric not null default 0,
  obtained numeric not null default 0,
  max_marks numeric not null default 0,
  percentage numeric not null default 0,
  division text not null default '',
  correct_count numeric not null default 0,
  wrong_count numeric not null default 0,
  unanswered_count numeric not null default 0,
  negative_total numeric not null default 0,
  time_taken_seconds numeric,
  evaluation_status text not null default 'evaluated',
  started_at timestamptz,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.exam_combined_results (
  id uuid primary key default gen_random_uuid(),
  guest_id text not null references public.guests(id) on delete cascade,
  batch_id uuid references public.exam_batches(id) on delete cascade,
  title text not null default '',
  student jsonb not null default '{}'::jsonb,
  subjects jsonb not null default '[]'::jsonb,
  exam_ids jsonb not null default '[]'::jsonb,
  total_obtained numeric not null default 0,
  total_max numeric not null default 0,
  percentage numeric not null default 0,
  division text not null default '',
  partial boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant all on public.guests to service_role;
grant all on public.profiles to service_role;
grant all on public.settings to service_role;
grant all on public.api_configs to service_role;
grant all on public.conversations to service_role;
grant all on public.messages to service_role;
grant all on public.attachments to service_role;
grant all on public.notes to service_role;
grant all on public.memories to service_role;
grant all on public.reminders to service_role;
grant all on public.goals to service_role;
grant all on public.lessons to service_role;
grant all on public.request_idempotency to service_role;
grant all on public.exam_batches to service_role;
grant all on public.exams to service_role;
grant all on public.exam_sessions to service_role;
grant all on public.exam_results to service_role;
grant all on public.exam_combined_results to service_role;

alter table public.guests enable row level security;
alter table public.profiles enable row level security;
alter table public.settings enable row level security;
alter table public.api_configs enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.attachments enable row level security;
alter table public.notes enable row level security;
alter table public.memories enable row level security;
alter table public.reminders enable row level security;
alter table public.goals enable row level security;
alter table public.lessons enable row level security;
alter table public.request_idempotency enable row level security;
alter table public.exam_batches enable row level security;
alter table public.exams enable row level security;
alter table public.exam_sessions enable row level security;
alter table public.exam_results enable row level security;
alter table public.exam_combined_results enable row level security;