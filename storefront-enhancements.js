(function(){
 const $=id=>document.getElementById(id);
 const readList=key=>{try{const v=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(v)?v:[]}catch(_){return []}};
 let cart=readList('md_cart').filter(x=>x&&Number.isFinite(Number(x.id))&&Number.isFinite(Number(x.qty))&&Number(x.qty)>0);
 let favorites=readList('md_favorites').map(Number).filter(Number.isFinite);
 let filter='';
 function persist(){localStorage.setItem('md_cart',JSON.stringify(cart));localStorage.setItem('md_favorites',JSON.stringify(favorites));count()}
 function count(){const n=$('cartCount');if(n)n.textContent='('+cart.reduce((a,x)=>a+Number(x.qty||0),0)+')'}
 window.addToCart=function(id){
  const p=(productsCache||[]).find(x=>String(x.id)===String(id));
  if(!p||Number(p.stock)<=0)return alert('Produit indisponible.');
  const row=cart.find(x=>String(x.id)===String(id));
  if(row){if(Number(row.qty)>=Number(p.stock))return alert('La quantité disponible en stock est atteinte.');row.qty++}
  else cart.push({id:p.id,name:p.name,price:Number(p.price),qty:1});
  persist();alert('Produit ajouté au panier.');
 };
 window.toggleFavorite=function(id){
  id=Number(id);favorites=favorites.includes(id)?favorites.filter(x=>x!==id):[...favorites,id];
  persist();window.renderShop();
 };
 window.filterShop=function(v){filter=String(v||'').toLowerCase().trim();window.renderShop()};
 window.showFavorites=function(){
  filter='';window.renderShop().then(function(){
   document.querySelectorAll('[data-md-product]').forEach(function(el){
    el.style.display=favorites.includes(Number(el.getAttribute('data-md-product')))?'':'none';
   });
  });
 };
 window.openCart=function(){
  const box=$('cartContents');if(!box)return;
  box.innerHTML=cart.length?cart.map(function(x){
   const safeName=esc(x.name||'Produit');
   return '<div class="cart-line"><span>'+safeName+' × '+Number(x.qty)+'<br><small>'+money(Number(x.price)*Number(x.qty))+'</small></span><span><button onclick="changeCartQty('+Number(x.id)+',-1)">−</button> <button onclick="changeCartQty('+Number(x.id)+',1)">+</button> <button onclick="removeCartItem('+Number(x.id)+')">×</button></span></div>';
  }).join(''):'<p class="muted">Votre panier est vide.</p>';
  $('cartTotal').textContent='Total produits : '+money(cart.reduce((a,x)=>a+Number(x.price)*Number(x.qty),0));
  $('cartModal').style.display='flex';
 };
 window.changeCartQty=function(id,d){
  const x=cart.find(x=>String(x.id)===String(id));if(!x)return;
  const p=(productsCache||[]).find(p=>String(p.id)===String(id));
  const next=Number(x.qty)+Number(d);
  if(next<=0){cart=cart.filter(x=>String(x.id)!==String(id))}
  else if(p&&next>Number(p.stock)){return alert('La quantité disponible en stock est atteinte.')}
  else x.qty=next;
  persist();openCart();
 };
 window.removeCartItem=function(id){cart=cart.filter(x=>String(x.id)!==String(id));persist();openCart()};
 window.closeShopModal=function(id){$(id).style.display='none'};
 const oldRender=window.renderShop;
 window.renderShop=async function(){
  await oldRender();
  const grid=document.querySelector('.section .products');if(!grid)return;
  grid.querySelectorAll('.product').forEach(function(el){
   const productId=el.getAttribute('data-product-id');
   const title=el.querySelector('h3')?.textContent||'';
   const p=(productsCache||[]).find(x=>productId?String(x.id)===String(productId):x.name===title);if(!p)return;
   el.setAttribute('data-md-product',p.id);
   if(filter&&!((p.name+' '+(p.description||'')).toLowerCase().includes(filter)))el.style.display='none';
   const actions=document.createElement('div');actions.className='product-actions';
   actions.innerHTML='<button '+(Number(p.stock)<=0?'disabled':'')+' onclick="addToCart('+Number(p.id)+')">Ajouter au panier</button><button class="fav" onclick="toggleFavorite('+Number(p.id)+')">'+(favorites.includes(Number(p.id))?'♥':'♡')+'</button>';
   el.appendChild(actions);
  });
 };
 document.addEventListener('DOMContentLoaded',function(){
  const head=document.querySelector('.head');
  if(head&&!$('cartModal')){
   const modal=document.createElement('div');modal.id='cartModal';modal.className='shop-modal';modal.style.display='none';
   modal.innerHTML='<div class="shop-modal-card"><h2>Votre panier</h2><div id="cartContents"></div><p id="cartTotal"></p><button class="primary" id="mdCheckoutOpen" type="button">Commander</button> <button class="back" onclick="closeShopModal(\'cartModal\')">Continuer mes achats</button><div id="mdCheckout" style="display:none;margin-top:18px;border-top:1px solid #eadfce;padding-top:16px"><h3>Vos coordonnées</h3><form id="mdCheckoutForm" style="display:grid;gap:9px"><input name="full_name" required maxlength="120" placeholder="Nom et prénom" autocomplete="name" style="padding:11px;border:1px solid #ddd;border-radius:8px"><input name="phone" required maxlength="40" placeholder="Téléphone" autocomplete="tel" style="padding:11px;border:1px solid #ddd;border-radius:8px"><input name="wilaya" required maxlength="100" placeholder="Wilaya" style="padding:11px;border:1px solid #ddd;border-radius:8px"><input name="city" required maxlength="120" placeholder="Commune" style="padding:11px;border:1px solid #ddd;border-radius:8px"><textarea name="address" required maxlength="500" placeholder="Adresse complète" rows="2" style="padding:11px;border:1px solid #ddd;border-radius:8px"></textarea><textarea name="customer_note" maxlength="1000" placeholder="Note (facultatif)" rows="2" style="padding:11px;border:1px solid #ddd;border-radius:8px"></textarea><p class="muted">Paiement à la livraison. Les commandes seront ouvertes après la configuration des frais de livraison.</p><button class="primary" type="submit">Confirmer la commande</button><p id="mdCheckoutMessage" class="muted" role="status"></p></form></div></div>';
   modal.addEventListener('click',function(e){if(e.target===modal)closeShopModal('cartModal')});document.body.appendChild(modal);
   const checkoutOpen=$('mdCheckoutOpen');
   if(checkoutOpen)checkoutOpen.onclick=function(){
    if(!cart.length)return alert('Votre panier est vide.');
    $('mdCheckout').style.display='block';
    $('mdCheckout').scrollIntoView({behavior:'smooth',block:'nearest'});
   };
   const checkoutForm=$('mdCheckoutForm');
   if(checkoutForm)checkoutForm.onsubmit=async function(e){
    e.preventDefault();
    const msg=$('mdCheckoutMessage');const submit=checkoutForm.querySelector('button[type="submit"]');
    if(!cart.length){msg.textContent='Votre panier est vide.';return;}
    submit.disabled=true;msg.textContent='Envoi de votre commande...';
    try{
     const fd=new FormData(checkoutForm);
     const orderPayload={
      p_full_name:String(fd.get('full_name')||'').trim(),
      p_phone:String(fd.get('phone')||'').trim(),
      p_wilaya:String(fd.get('wilaya')||'').trim(),
      p_city:String(fd.get('city')||'').trim(),
      p_address:String(fd.get('address')||'').trim(),
      p_items:cart.map(x=>({product_id:Number(x.id),quantity:Number(x.qty)})),
      p_customer_note:String(fd.get('customer_note')||'').trim()||null
     };
     // Keep one idempotency key for an unchanged order across refreshes and network retries.
     const fingerprint=JSON.stringify(orderPayload);
     let pending=null;
     try{pending=JSON.parse(localStorage.getItem('md_pending_checkout')||'null')}catch(_){}
     const makeRequestId=()=>((window.crypto&&crypto.randomUUID)?crypto.randomUUID():'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0;return(c==='x'?r:(r&3|8)).toString(16)}));
     const requestId=pending&&pending.fingerprint===fingerprint?pending.id:makeRequestId();
     localStorage.setItem('md_pending_checkout',JSON.stringify({fingerprint,id:requestId}));
     const {data,error}=await SUPA.rpc('create_store_order',{
      ...orderPayload,
      p_request_id:requestId
     });
     if(error)throw error;
     if(!data||data.success!==true)throw new Error('Réponse de commande inattendue.');
     localStorage.removeItem('md_pending_checkout');
     cart=[];persist();checkoutForm.reset();$('mdCheckout').style.display='none';
     $('cartContents').innerHTML='<p><b>Merci ! Votre commande #'+esc(data.order_id)+'</b></p><p>Votre commande a été enregistrée. Paiement à la livraison.</p>';
     $('cartTotal').textContent='Total : '+money(data.total);
     $('mdCheckoutOpen').style.display='none';
     msg.textContent='';
    }catch(err){msg.textContent='Commande non enregistrée : '+(err.message||err);}
    finally{submit.disabled=false;}
   };
   const quick=document.querySelector('.quick');
   if(quick)quick.innerHTML='<button onclick="showFavorites()">♡<br>Favoris</button><button onclick="openCart()">🛒<br>Panier <span id="cartCount">(0)</span></button>';
   const search=document.querySelector('.search');
   if(search){const input=search.querySelector('input');input.id='mdSearch';input.oninput=function(){filterShop(input.value)};const btn=search.querySelector('button');btn.onclick=function(){filterShop(input.value)}}
  }
  count();window.renderShop();
 });
 if(document.readyState!=='loading'){count();setTimeout(function(){window.renderShop()},0)}
})();
