-- Maison Délice: pickup-only checkout with product capacity variants.
-- Requires the product_variants table and order_items.variant_id/capacity_snapshot.
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
  v_line record;
  v_variant public.product_variants%rowtype;
  v_product public.products%rowtype;
  v_subtotal numeric(12,2) := 0;
  v_updated integer;
  v_capacity text;
begin
  if p_request_id is null then raise exception 'Identifiant de commande manquant'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
  select * into v_existing from public.orders where request_id=p_request_id;
  if found then
    return jsonb_build_object('success',true,'order_id',v_existing.id,
      'status',v_existing.status,'total',v_existing.total,'reused',true);
  end if;
  if nullif(trim(coalesce(p_full_name,'')), '') is null or length(trim(p_full_name))>120 then
    raise exception 'Nom invalide';
  end if;
  if nullif(trim(coalesce(p_phone,'')), '') is null or length(trim(p_phone))>40 then
    raise exception 'Numéro de téléphone invalide';
  end if;
  if p_customer_note is not null and length(p_customer_note)>1000 then
    raise exception 'La note est trop longue';
  end if;
  if p_items is null or jsonb_typeof(p_items)<>'array'
     or jsonb_array_length(p_items)=0 or jsonb_array_length(p_items)>50 then
    raise exception 'Panier invalide';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_items)
      as x(product_id bigint,variant_id bigint,quantity integer)
    where x.product_id is null or x.product_id<=0 or x.variant_id is null
       or x.variant_id<=0 or x.quantity is null or x.quantity<=0 or x.quantity>500
  ) then
    raise exception 'Un article du panier contient une contenance ou une quantité invalide';
  end if;

  insert into public.customers(name,phone)
  values(trim(p_full_name),trim(p_phone)) returning id into v_customer_id;
  insert into public.orders(customer_id,status,total,delivery_fee,request_id,customer_note)
  values(v_customer_id,'pending',0,0,p_request_id,nullif(trim(coalesce(p_customer_note,'')),''))
  returning id into v_order_id;

  for v_line in
    select x.product_id,x.variant_id,sum(x.quantity)::integer as quantity
    from jsonb_to_recordset(p_items)
      as x(product_id bigint,variant_id bigint,quantity integer)
    group by x.product_id,x.variant_id order by x.variant_id
  loop
    select * into v_product from public.products where id=v_line.product_id for update;
    if not found or coalesce(v_product.active,false) is not true or v_product.is_active is not true then
      raise exception 'Un produit du panier n’est plus disponible';
    end if;
    select * into v_variant from public.product_variants
    where id=v_line.variant_id and product_id=v_line.product_id for update;
    if not found or coalesce(v_variant.active,false) is not true then
      raise exception 'Une contenance choisie n’est plus disponible';
    end if;
    if v_variant.stock<v_line.quantity then
      raise exception 'Stock insuffisant pour % (%).',v_product.name,
        coalesce(nullif(trim(v_variant.weight),''),v_variant.name);
    end if;
    v_capacity:=coalesce(nullif(trim(v_variant.weight),''),v_variant.name);
    insert into public.order_items(order_id,product_id,variant_id,capacity_snapshot,quantity,unit_price)
    values(v_order_id,v_line.product_id,v_line.variant_id,v_capacity,v_line.quantity,v_variant.price);
    update public.product_variants set stock=stock-v_line.quantity
    where id=v_line.variant_id and stock>=v_line.quantity and active=true;
    get diagnostics v_updated=row_count;
    if v_updated<>1 then raise exception 'Le stock de la contenance choisie a changé. Actualisez le panier.'; end if;
    update public.products
    set stock=(select coalesce(sum(pv.stock),0) from public.product_variants pv
               where pv.product_id=v_line.product_id)
    where id=v_line.product_id;
    insert into public.stock_movements(product_id,variant_id,quantity,movement_type,order_id)
    values(v_line.product_id,v_line.variant_id,-v_line.quantity,'sale',v_order_id);
    v_subtotal:=v_subtotal+(v_variant.price*v_line.quantity);
  end loop;
  update public.orders set total=v_subtotal where id=v_order_id;
  return jsonb_build_object('success',true,'order_id',v_order_id,'status','pending',
    'subtotal',v_subtotal,'total',v_subtotal,'reused',false,'fulfillment','pickup');
end;
$function$;
revoke all on function public.create_store_order(text,text,jsonb,uuid,text) from public;
grant execute on function public.create_store_order(text,text,jsonb,uuid,text) to anon,authenticated;
commit;