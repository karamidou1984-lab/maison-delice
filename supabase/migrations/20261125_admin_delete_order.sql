-- Maison Délice: safely delete an order from the admin panel and restore its reserved stock.
-- Run once in Supabase SQL Editor after reviewing this migration.
begin;

create or replace function public.admin_delete_store_order(p_order_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_order public.orders%rowtype;
  v_lines integer;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Accès réservé à un administrateur';
  end if;

  if p_order_id is null or p_order_id <= 0 then
    raise exception 'Numéro de commande invalide';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Commande introuvable';
  end if;

  -- Restore exactly the quantities reserved by this order before removing its lines.
  with quantities as (
    select product_id, sum(quantity)::integer as qty
    from public.order_items
    where order_id = p_order_id
    group by product_id
  )
  update public.products p
  set stock = p.stock + quantities.qty
  from quantities
  where p.id = quantities.product_id;

  get diagnostics v_lines = row_count;

  -- Keep the customer record. The stock movement history remains, with its order_id
  -- set to NULL by the existing ON DELETE SET NULL foreign key.
  delete from public.order_items where order_id = p_order_id;
  delete from public.orders where id = p_order_id;

  return jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'restored_product_rows', v_lines
  );
end;
$function$;

revoke all on function public.admin_delete_store_order(bigint) from public;
grant execute on function public.admin_delete_store_order(bigint) to authenticated;

commit;
