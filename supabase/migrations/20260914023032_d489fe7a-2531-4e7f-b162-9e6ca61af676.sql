insert into public.certificate_templates (code, certificate_type, title, subtitle, theme)
values (
  'ustad-cert-weekly-rank-v1', 'weekly_rank',
  'Certificate of Weekly Ranking', 'USTAD AI Weekly Leaderboard',
  '{"tier":"rank","ink":"#08291f","accent":"#0f8a5f","accentSoft":"#c9efe0","paper":"#f9fffc","border":"double","seal":"#0f8a5f","pattern":"laurel"}'::jsonb
)
on conflict (code) do nothing;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'ustad_rank_awards'
      and policyname = 'service role manages rank awards'
  ) then
    create policy "service role manages rank awards"
      on public.ustad_rank_awards for all to service_role
      using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'ustad_rank_cycles'
      and policyname = 'service role manages rank cycles'
  ) then
    create policy "service role manages rank cycles"
      on public.ustad_rank_cycles for all to service_role
      using (true) with check (true);
  end if;
end $$;

alter table public.profiles
  add column if not exists equipped_badge text,
  add column if not exists equipped_name_style text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_equipped_badge_fk'
  ) then
    alter table public.profiles
      add constraint profiles_equipped_badge_fk
      foreign key (equipped_badge) references public.ustad_shop_items (item_id)
      on delete set null;
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_equipped_name_style_fk'
  ) then
    alter table public.profiles
      add constraint profiles_equipped_name_style_fk
      foreign key (equipped_name_style) references public.ustad_shop_items (item_id)
      on delete set null;
  end if;
end $$;