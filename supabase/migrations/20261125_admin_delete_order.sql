-- Maison Délice: safely delete an order and restore its reserved stock,
-- including independent product-variant stock and legacy order lines.
begin;
create or replace function public.admin_delete_store_order(p_order_id bigint)
returns jsonb language plpgsql security definer set search_path = public
as $function$
declare
  v_order public.orders%rowtype;
  v_lines integer := 0;
  v_variant record;
  v_legacy record;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Accès réservé à un administrateur';
  end if;
  if p_order_id is null or p_order_id <= 0 then
    raise exception 'Numéro de commande invalide';
  end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'Commande introuvable'; end if;

  for v_variant in
    select variant_id, product_id, sum(quantity)::integer as qty
    from public.order_items
    where order_id=p_order_id and variant_id is not null
    group by variant_id, product_id order by variant_id
  loop
    update public.product_variants
      set stock=stock+v_variant.qty
      where id=v_variant.variant_id and product_id=v_variant.product_id;
    update public.products
      set stock=(select coalesce(sum(pv.stock),0) from public.product_variants pv
                 where pv.product_id=v_variant.product_id)
      where id=v_variant.product_id;
    v_lines := v_lines + 1;
  end loop;

  for v_legacy in
    select product_id, sum(quantity)::integer as qty
    from public.order_items
    where order_id=p_order_id and variant_id is null
    group by product_id
  loop
    update public.products set stock=stock+v_legacy.qty
    where id=v_legacy.product_id;
    v_lines := v_lines + 1;
  end loop;

  delete from public.order_items where order_id=p_order_id;
  delete from public.orders where id=p_order_id;
  return jsonb_build_object('success',true,'order_id',p_order_id,
    'restored_product_rows',v_lines);
end;
$function$;
revoke all on function public.admin_delete_store_order(bigint) from public;
grant execute on function public.admin_delete_store_order(bigint) to authenticated;
commit;