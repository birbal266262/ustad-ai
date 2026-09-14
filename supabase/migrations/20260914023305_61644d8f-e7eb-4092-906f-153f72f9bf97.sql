revoke execute on function public.ustad_issue_fresh_session(text) from anon, authenticated;
revoke execute on function public.ustad_refresh_session(text, uuid) from anon, authenticated;
revoke execute on function public.ustad_revoke_session(uuid, text) from anon, authenticated;
revoke execute on function public.ustad_create_guest_account(text, text, text, text) from anon, authenticated;
revoke execute on function public.ustad_coin_offer_touch() from public, anon, authenticated;
revoke execute on function public.ustad_shop_buy(text, text, bigint, text, integer, bigint) from anon, authenticated;
revoke execute on function public.ustad_coin_apply(text, text, text, bigint, text, text) from anon, authenticated;