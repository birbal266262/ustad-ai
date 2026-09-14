-- PART 8 — Profile DP / avatar + equipped avatar frame.

alter table public.profiles
  add column if not exists avatar_ref text,
  add column if not exists avatar_mime text,
  add column if not exists avatar_updated_at timestamptz,
  add column if not exists equipped_frame text,
  add column if not exists created_at timestamptz not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_equipped_frame_fk') then
    alter table public.profiles
      add constraint profiles_equipped_frame_fk
      foreign key (equipped_frame) references public.ustad_shop_items (item_id)
      on delete set null;
  end if;
end $$;

create index if not exists profiles_avatar_idx on public.profiles (guest_id) where avatar_ref is not null;