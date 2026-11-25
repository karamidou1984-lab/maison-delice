(function(){
  const originalRender=window.render;
  const money=n=>new Intl.NumberFormat('fr-DZ').format(Number(n||0))+' DA';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function parseOverrides(raw){
    const out={};
    String(raw||'').split(/\r?\n/).forEach(line=>{
      const s=line.trim(); if(!s)return;
      const pos=s.lastIndexOf('=');
      if(pos<1)throw new Error('Format commune invalide. Utilisez : Commune = prix');
      const name=s.slice(0,pos).trim(), fee=Number(s.slice(pos+1).trim());
      if(!name||!Number.isFinite(fee)||fee<0)throw new Error('Vérifiez les communes et leurs frais (montant positif ou nul).');
      out[name]=fee;
    });
    return out;
  }
  function rowHtml(wilaya='',fee='',communes={}){
    const lines=Object.entries(communes||{}).map(([k,v])=>k+' = '+v).join('\n');
    return '<div class="panel md-delivery-row" style="margin:12px 0;display:grid;gap:9px"><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:9px"><label>Wilaya<input class="md-wilaya" value="'+esc(wilaya)+'" placeholder="Ex. Oran" style="display:block;width:100%;padding:10px;border:1px solid #ddd;border-radius:8px"></label><label>Tarif par défaut (DA)<input class="md-fee" type="number" min="0" step="1" value="'+esc(fee)+'" placeholder="À définir" style="display:block;width:100%;padding:10px;border:1px solid #ddd;border-radius:8px"></label></div><label>Tarifs particuliers par commune (facultatif)<textarea class="md-communes" rows="3" placeholder="Bir El Djir = 600\nEs Sénia = 500" style="display:block;width:100%;padding:10px;border:1px solid #ddd;border-radius:8px">'+esc(lines)+'</textarea></label><button type="button" class="back md-remove">Supprimer cette wilaya</button></div>';
  }
  async function renderDeliverySettings(){
    const host=document.getElementById('pageContent');
    host.innerHTML='<div class="panel">Chargement des tarifs de livraison...</div>';
    const {data,error}=await SUPA.from('store_settings').select('value').eq('key','delivery_fees').maybeSingle();
    if(error)throw error;
    const config=data?.value&&typeof data.value==='object'?data.value:{wilayas:{}};
    const entries=Object.entries(config.wilayas||{});
    host.innerHTML='<div class="panel"><h3>Paramètres de livraison</h3><p class="muted">Définissez manuellement un tarif par défaut pour chaque wilaya. Vous pouvez ajouter des tarifs spécifiques à certaines communes. Aucun tarif n’est prérempli.</p><div id="mdDeliveryRows">'+(entries.length?entries.map(([w,v])=>rowHtml(w,v?.default??'',v?.communes||{})).join(''):rowHtml())+'</div><div class="admin-actions"><button type="button" id="mdAddWilaya">+ Ajouter une wilaya</button><button type="button" class="blackbtn" id="mdSaveDelivery">Enregistrer les tarifs</button></div><p id="mdDeliveryMessage" class="muted" role="status">Les tarifs enregistrés sont lus par la fonction sécurisée lors de la commande. Toute destination sans tarif sera refusée.</p></div>';
    const rows=document.getElementById('mdDeliveryRows');
    document.getElementById('mdAddWilaya').onclick=()=>{rows.insertAdjacentHTML('beforeend',rowHtml());};
    rows.addEventListener('click',e=>{if(e.target.classList.contains('md-remove'))e.target.closest('.md-delivery-row').remove();});
    document.getElementById('mdSaveDelivery').onclick=async()=>{
      const msg=document.getElementById('mdDeliveryMessage');msg.textContent='Enregistrement...';
      try{
        const wilayas={};
        rows.querySelectorAll('.md-delivery-row').forEach(row=>{
          const name=row.querySelector('.md-wilaya').value.trim();
          const feeText=row.querySelector('.md-fee').value.trim();
          if(!name&&!feeText&&!row.querySelector('.md-communes').value.trim())return;
          const fee=Number(feeText);
          if(!name||!feeText||!Number.isFinite(fee)||fee<0)throw new Error('Chaque wilaya doit avoir un nom et un tarif par défaut valide.');
          if(wilayas[name])throw new Error('Wilaya répétée : '+name);
          wilayas[name]={default:fee,communes:parseOverrides(row.querySelector('.md-communes').value)};
        });
        const {error:saveError}=await SUPA.from('store_settings').upsert({key:'delivery_fees',value:{wilayas},updated_at:new Date().toISOString()},{onConflict:'key'});
        if(saveError)throw saveError;
        msg.textContent='Tarifs enregistrés. Ils ne sont pas encore appliqués aux commandes publiques.';
      }catch(e){msg.textContent='Erreur : '+(e.message||e);}
    };
  }
  window.render=async function(page){
    if(page!=='settings')return originalRender(page);
    currentPage=page;document.getElementById('pageTitle').textContent='Paramètres';
    try{await renderDeliverySettings();}
    catch(e){document.getElementById('pageContent').innerHTML='<div class="panel"><b>Impossible de charger les tarifs</b><p class="muted">'+esc(e.message||e)+'</p></div>';}
  };
})();