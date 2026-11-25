-- Maison Délice: switch checkout to in-store pickup only
-- Run after 20261125_secure_store_checkout.sql has been applied.
begin;
drop function if exists public.create_store_order(text,text,text,text,text,jsonb,uuid,text);
create or replace function public.create_store_order(
  p_full_name text, p_phone text, p_items jsonb, p_request_id uuid,
  p_customer_note text default null
)
returns jsonb language plpgsql security definer set search_path = public
as $function$
declare
  v_existing public.orders%rowtype;
  v_customer_id bigint;
  v_order_id bigint;
  v_product record;
  v_product_row public.products%rowtype;
  v_subtotal numeric(12,2) := 0;
  v_updated integer;
begin
  if p_request_id is null then raise exception 'Identifiant de commande manquant'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
  select * into v_existing from public.orders where request_id = p_request_id;
  if found then
    return jsonb_build_object('success',true,'order_id',v_existing.id,
      'status',v_existing.status,'total',v_existing.total,'reused',true);
  end if;
  if nullif(trim(coalesce(p_full_name,'')), '') is null or length(trim(p_full_name)) > 120 then
    raise exception 'Nom invalide';
  end if;
  if nullif(trim(coalesce(p_phone,'')), '') is null or length(trim(p_phone)) > 40 then
    raise exception 'Numéro de téléphone invalide';
  end if;
  if p_customer_note is not null and length(p_customer_note) > 1000 then
    raise exception 'La note est trop longue';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items)=0 or jsonb_array_length(p_items)>50 then
    raise exception 'Panier invalide';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_items) as x(product_id bigint,quantity integer)
    where x.product_id is null or x.product_id<=0 or x.quantity is null
      or x.quantity<=0 or x.quantity>500
  ) then raise exception 'Un article du panier contient une quantité ou un identifiant invalide'; end if;

  insert into public.customers(name,phone)
  values(trim(p_full_name),trim(p_phone)) returning id into v_customer_id;
  insert into public.orders(customer_id,status,total,delivery_fee,request_id,customer_note)
  values(v_customer_id,'pending',0,0,p_request_id,nullif(trim(coalesce(p_customer_note,'')),''))
  returning id into v_order_id;

  for v_product in
    select x.product_id,sum(x.quantity)::integer as quantity
    from jsonb_to_recordset(p_items) as x(product_id bigint,quantity integer)
    group by x.product_id order by x.product_id
  loop
    select * into v_product_row from public.products
    where id=v_product.product_id for update;
    if not found then raise exception 'Un produit du panier n’existe plus'; end if;
    if coalesce(v_product_row.active,false) is not true or v_product_row.is_active is not true then
      raise exception 'Un produit du panier n’est plus disponible';
    end if;
    if v_product_row.price<0 then raise exception 'Prix produit invalide'; end if;
    if v_product_row.stock<v_product.quantity then
      raise exception 'Stock insuffisant pour : %',v_product_row.name;
    end if;
    insert into public.order_items(order_id,product_id,quantity,unit_price)
    values(v_order_id,v_product.product_id,v_product.quantity,v_product_row.price);
    update public.products set stock=stock-v_product.quantity
    where id=v_product.product_id and stock>=v_product.quantity
      and coalesce(active,false)=true and is_active=true;
    get diagnostics v_updated=row_count;
    if v_updated<>1 then raise exception 'Le stock a changé. Veuillez actualiser votre panier.'; end if;
    insert into public.stock_movements(product_id,quantity,movement_type,order_id)
    values(v_product.product_id,-v_product.quantity,'sale',v_order_id);
    v_subtotal:=v_subtotal+(v_product_row.price*v_product.quantity);
  end loop;
  update public.orders set total=v_subtotal where id=v_order_id;
  return jsonb_build_object('success',true,'order_id',v_order_id,'status','pending',
    'subtotal',v_subtotal,'total',v_subtotal,'reused',false,'fulfillment','pickup');
end;
$function$;
revoke all on function public.create_store_order(text,text,jsonb,uuid,text) from public;
grant execute on function public.create_store_order(text,text,jsonb,uuid,text) to anon,authenticated;
commit;
