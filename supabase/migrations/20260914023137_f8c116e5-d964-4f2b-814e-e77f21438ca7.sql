drop function if exists public.ustad_shop_buy(text, text);

create or replace function public.ustad_shop_buy(
  p_guest_id text,
  p_item_id text,
  p_final_price bigint default null,
  p_offer_weekly_id text default null,
  p_discount_pct integer default null,
  p_offer_base_price bigint default null
) returns table (
  purchase_id uuid,
  transaction_id uuid,
  price_paid bigint,
  balance_after bigint,
  already_owned boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.ustad_shop_items%rowtype;
  v_existing public.ustad_purchases%rowtype;
  v_apply record;
  v_purchase_id uuid;
  v_charge bigint;
  v_base bigint;
  v_wallet_balance bigint;
begin
  select * into v_item from public.ustad_shop_items where item_id = p_item_id;
  if not found then
    raise exception 'UNKNOWN_ITEM: %', p_item_id;
  end if;
  if v_item.status <> 'active' then
    raise exception 'ITEM_UNAVAILABLE: %', p_item_id;
  end if;

  select * into v_existing
    from public.ustad_purchases
   where guest_id = p_guest_id and item_id = p_item_id and ownership_status = 'owned';
  if found then
    select current_balance into v_wallet_balance
      from public.ustad_wallets where guest_id = p_guest_id;
    return query select v_existing.purchase_id, v_existing.transaction_id,
                        v_existing.price_paid, coalesce(v_wallet_balance, 0), true;
    return;
  end if;

  v_charge := coalesce(p_final_price, v_item.price_coins);
  if v_charge <= 0 then
    raise exception 'INVALID_FINAL_PRICE';
  end if;
  if p_final_price is not null and p_final_price > v_item.price_coins then
    raise exception 'INVALID_FINAL_PRICE';
  end if;

  select * into v_apply from public.ustad_coin_apply(
    p_guest_id, 'shop', 'purchase:' || p_item_id, -v_charge,
    'shop_purchase', v_item.name);

  insert into public.ustad_purchases
    (guest_id, item_id, price_paid, transaction_id, ownership_status)
  values
    (p_guest_id, p_item_id, v_charge, v_apply.transaction_id, 'owned')
  returning public.ustad_purchases.purchase_id into v_purchase_id;

  if p_offer_weekly_id is not null then
    v_base := coalesce(p_offer_base_price, v_item.price_coins);
    insert into public.ustad_coin_offer_purchases
      (weekly_offer_id, guest_id, item_kind, item_id,
       base_price, discount_pct, discount_amount, final_price, source, ref_id)
    values
      (p_offer_weekly_id, p_guest_id, 'shop', p_item_id,
       v_base, coalesce(p_discount_pct, 0), greatest(v_base - v_charge, 0), v_charge,
       'shop', 'purchase:' || v_purchase_id);
  end if;

  return query select v_purchase_id, v_apply.transaction_id,
                      v_charge, v_apply.balance_after, false;
end;
$$;

revoke all on function public.ustad_shop_buy(text, text, bigint, text, integer, bigint) from public, anon;
grant execute on function public.ustad_shop_buy(text, text, bigint, text, integer, bigint) to service_role;

alter table public.ustad_notifications
  add column if not exists deleted_at timestamptz;

create index if not exists ustad_notifications_deleted_idx
  on public.ustad_notifications (guest_id, deleted_at)
  where deleted_at is null;