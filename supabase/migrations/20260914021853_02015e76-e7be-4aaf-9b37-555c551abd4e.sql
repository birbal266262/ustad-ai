-- Curriculum Brain (Part 1) + Book/Chapter Knowledge (Part 2)
create table if not exists public.curriculum_boards (
  board_id text primary key,
  name text not null,
  session_start_month int not null,
  aliases jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.curriculum_sessions (
  session_id text primary key,
  board_id text not null references public.curriculum_boards(board_id) on delete cascade,
  start_year int not null,
  end_year int not null,
  label text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.curriculum_subjects (
  subject_id text primary key,
  board_id text not null references public.curriculum_boards(board_id) on delete cascade,
  klass int not null,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.curriculum_books (
  book_id text primary key,
  board_id text not null,
  klass int not null,
  subject_id text not null,
  book_name text not null,
  book_part text,
  academic_session text not null,
  edition text,
  source_reference text,
  last_verified_at timestamptz,
  verification_status text not null default 'UNVERIFIED',
  record_status text not null default 'CURRENT',
  created_at timestamptz not null default now()
);

create table if not exists public.curriculum_chapters (
  chapter_id text primary key,
  book_id text not null references public.curriculum_books(book_id) on delete cascade,
  chapter_number int not null,
  chapter_name text not null,
  chapter_order int not null,
  source_reference text,
  last_verified_at timestamptz,
  verification_status text not null default 'VERIFIED',
  created_at timestamptz not null default now()
);

create table if not exists public.curriculum_verifications (
  id bigint generated always as identity primary key,
  board_id text not null,
  academic_session text not null,
  klass int not null,
  subject_id text not null,
  book_id text not null,
  source_reference text,
  verification_status text not null,
  record_status text not null,
  verified_at timestamptz not null default now()
);

create index if not exists curriculum_chapters_book_idx on public.curriculum_chapters(book_id, chapter_order);
create index if not exists curriculum_books_lookup_idx on public.curriculum_books(board_id, academic_session, klass, subject_id);

create table if not exists public.curriculum_chapters_detail (
  chapter_id text primary key,
  book_id text not null,
  chapter_number int not null,
  chapter_name text not null,
  section_order int[] not null default '{}'::int[],
  topics_count int not null default 0,
  concepts_count int not null default 0,
  formulas_count int not null default 0,
  examples_count int not null default 0,
  questions_count int not null default 0,
  summary text,
  source_reference text,
  verification_status text not null default 'UNVERIFIED',
  record_status text not null default 'CURRENT',
  version text not null default '',
  extracted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.curriculum_sections (
  section_id text primary key,
  chapter_id text not null,
  book_id text not null,
  "order" int not null default 0,
  title text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.curriculum_topics (
  topic_id text primary key,
  section_id text,
  chapter_id text not null,
  book_id text not null,
  "order" int not null default 0,
  title text not null,
  content text,
  created_at timestamptz not null default now()
);

create table if not exists public.curriculum_concepts (
  concept_id text primary key,
  topic_id text,
  chapter_id text not null,
  book_id text not null,
  kind text not null default 'concept',
  text text not null,
  math_raw text,
  variables text[],
  source_location text,
  created_at timestamptz not null default now()
);

create table if not exists public.curriculum_questions (
  question_id text primary key,
  chapter_id text not null,
  section_id text,
  book_id text not null,
  text text not null,
  question_type text not null default 'exercise',
  source_location text,
  related_concept text,
  related_formula text,
  diagram_required boolean not null default false,
  answer_reference text,
  created_at timestamptz not null default now()
);

create index if not exists curriculum_concepts_chapter_idx on public.curriculum_concepts(chapter_id);
create index if not exists curriculum_questions_chapter_idx on public.curriculum_questions(chapter_id);
create index if not exists curriculum_topics_chapter_idx on public.curriculum_topics(chapter_id);
create index if not exists curriculum_sections_chapter_idx on public.curriculum_sections(chapter_id);
create index if not exists curriculum_chapters_detail_book_idx on public.curriculum_chapters_detail(book_id, chapter_number);

grant all on public.curriculum_boards to service_role;
grant all on public.curriculum_sessions to service_role;
grant all on public.curriculum_subjects to service_role;
grant all on public.curriculum_books to service_role;
grant all on public.curriculum_chapters to service_role;
grant all on public.curriculum_verifications to service_role;
grant all on public.curriculum_chapters_detail to service_role;
grant all on public.curriculum_sections to service_role;
grant all on public.curriculum_topics to service_role;
grant all on public.curriculum_concepts to service_role;
grant all on public.curriculum_questions to service_role;

alter table public.curriculum_boards enable row level security;
alter table public.curriculum_sessions enable row level security;
alter table public.curriculum_subjects enable row level security;
alter table public.curriculum_books enable row level security;
alter table public.curriculum_chapters enable row level security;
alter table public.curriculum_verifications enable row level security;
alter table public.curriculum_chapters_detail enable row level security;
alter table public.curriculum_sections enable row level security;
alter table public.curriculum_topics enable row level security;
alter table public.curriculum_concepts enable row level security;
alter table public.curriculum_questions enable row level security;