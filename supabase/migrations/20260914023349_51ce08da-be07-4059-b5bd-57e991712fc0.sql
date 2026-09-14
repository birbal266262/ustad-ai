create or replace function public.ustad_create_guest_account(
  p_guest_id text,
  p_username text,
  p_username_normalized text,
  p_password_hash text
) returns table (guest_id text, username text, jti uuid, user_id uuid)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_jti uuid := gen_random_uuid();
begin
  insert into public.guests (id)
  values (p_guest_id)
  on conflict (id) do nothing;

  insert into public.profiles (guest_id)
  values (p_guest_id)
  on conflict (guest_id) do nothing;

  insert into public.settings (guest_id)
  values (p_guest_id)
  on conflict (guest_id) do nothing;

  insert into public.ustad_accounts
    (guest_id, username, username_normalized, password_hash, password_algo)
  values
    (p_guest_id, p_username, p_username_normalized, p_password_hash, 'scrypt')
  on conflict (guest_id) do nothing;

  if not exists (
    select 1 from public.ustad_accounts u
     where u.guest_id = p_guest_id
       and u.username_normalized = p_username_normalized
  ) then
    raise exception using
      errcode = 'U0001',
      message = 'guest_already_claimed';
  end if;

  insert into public.ustad_sessions (jti, guest_id, expires_at)
  values (v_jti, p_guest_id, now() + interval '365 days');

  return query
    select p_guest_id,
           (select u.username from public.ustad_accounts u where u.guest_id = p_guest_id),
           v_jti,
           (select u.user_id from public.ustad_accounts u where u.guest_id = p_guest_id);
end;
$$;

create or replace function public.ustad_issue_fresh_session(p_guest_id text)
returns table (jti uuid)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_jti uuid := gen_random_uuid();
begin
  update public.ustad_sessions s
     set revoked_at = now(), revoked_reason = 'rotated'
   where s.guest_id = p_guest_id
     and s.revoked_at is null;

  insert into public.ustad_sessions (jti, guest_id, expires_at)
  values (v_jti, p_guest_id, now() + interval '365 days');

  return query select v_jti;
end;
$$;

create or replace function public.ustad_refresh_session(p_guest_id text, p_jti uuid)
returns table (jti uuid)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  return query
    update public.ustad_sessions s
       set expires_at = now() + interval '365 days'
     where s.jti = p_jti
       and s.guest_id = p_guest_id
       and s.revoked_at is null
     returning s.jti;
end;
$$;

create or replace function public.ustad_revoke_session(p_jti uuid, p_reason text)
returns table (jti uuid, revoked_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  return query
    update public.ustad_sessions s
       set revoked_at = coalesce(s.revoked_at, now()),
           revoked_reason = case when s.revoked_reason = '' then p_reason else s.revoked_reason end
     where s.jti = p_jti
     returning s.jti, s.revoked_at;
end;
$$;

revoke execute on function public.ustad_coin_apply(text, text, text, bigint, text, text) from anon, authenticated, public;
revoke execute on function public.ustad_coin_offer_touch() from anon, authenticated, public;
revoke execute on function public.ustad_shop_buy(text, text, bigint, text, integer, bigint) from anon, authenticated, public;
revoke execute on function public.ustad_ticket_consume(text) from anon, authenticated, public;
revoke execute on function public.ustad_ticket_grant(text, integer) from anon, authenticated, public;
revoke execute on function public.ustad_create_guest_account(text, text, text, text) from anon, authenticated, public;
revoke execute on function public.ustad_issue_fresh_session(text) from anon, authenticated, public;
revoke execute on function public.ustad_refresh_session(text, uuid) from anon, authenticated, public;
revoke execute on function public.ustad_revoke_session(uuid, text) from anon, authenticated, public;
grant execute on function public.ustad_coin_apply(text, text, text, bigint, text, text) to service_role;
grant execute on function public.ustad_shop_buy(text, text, bigint, text, integer, bigint) to service_role;
grant execute on function public.ustad_ticket_consume(text) to service_role;
grant execute on function public.ustad_ticket_grant(text, integer) to service_role;
grant execute on function public.ustad_create_guest_account(text, text, text, text) to service_role;
grant execute on function public.ustad_issue_fresh_session(text) to service_role;
grant execute on function public.ustad_refresh_session(text, uuid) to service_role;
grant execute on function public.ustad_revoke_session(uuid, text) to service_role;