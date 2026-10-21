import { accountConfig } from './account-config.mjs';
import { AccountClient, normalizeItems, mergeItems } from './account-client.mjs';
let sessionStore=null;try{sessionStore=window.sessionStorage;}catch{}
const account=new AccountClient(accountConfig,{storage:sessionStore});
// Les confirmations e-mail peuvent renvoyer un fragment contenant des jetons.
// Ne pas les laisser dans l’adresse ; la connexion reste explicite via le formulaire.
if(new URLSearchParams(window.location.hash.slice(1)).has('access_token')){window.history.replaceState(null,'',window.location.pathname+window.location.search);}
let accountPending=false,accountLoaded=false,syncFailed=false,accountMode='login',accountEpoch=0,syncRevision=0,syncPending=0;
let syncQueue=Promise.resolve(),pendingGuest=[];
const importedIds=new Set();
const initial=[
{id:'vase',description:'Une pièce décorative aux lignes arrondies pour accueillir quelques fleurs ou habiller une étagère. Produit de démonstration, photo illustrative.',name:'Vase Terra en céramique',store:'Atelier Noma',price:34,category:'Maison',image:'photo-1578500494198-246f612d3b3d'},
{id:'bag',description:'Un cabas pour accompagner vos sorties et vos trouvailles du quotidien. Produit de démonstration, photo illustrative.',name:'Le cabas des beaux jours',store:'Maison Awa',price:49,category:'Mode',image:'photo-1553062407-98eeb64c6a62'},
{id:'lamp',description:'Une touche lumineuse pour créer une ambiance accueillante dans votre intérieur. Produit de démonstration, photo illustrative.',name:'Lampe aux lignes douces',store:'Studio Lumière',price:89,category:'Maison',image:'photo-1507473885765-e6ed057f782c'},
{id:'care',description:'Une idée de rituel à découvrir dans notre sélection beauté. Produit de démonstration, photo illustrative.',name:'Rituel de soin naturel',store:'Botanica',price:28,category:'Beauté',image:'photo-1608571423902-eed4a5ad8108'}];
const $=s=>document.querySelector(s);const currency=n=>new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(n);
function read(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}}
const saved=read('marchea-products',[]);let products=[...initial,...(Array.isArray(saved)?saved.filter(p=>p&&typeof p.id==='string'&&typeof p.name==='string'&&typeof p.store==='string'&&Number.isFinite(p.price)&&p.price>0&&['Maison','Mode','Beauté'].includes(p.category)).map(p=>({...p,image:typeof p.image==='string'&&/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(p.image)&&p.image.length<500000?p.image:null})):[])];let cart=read('marchea-cart',{});if(!cart||typeof cart!=='object'||Array.isArray(cart))cart={};for(const id of Object.keys(cart)){if(!products.some(p=>p.id===id)||!Number.isInteger(cart[id])||cart[id]<1||cart[id]>999)delete cart[id];}let category='Tous';let toastTimer;
function save(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{notify('Stockage indisponible : les changements restent dans cette session.');return false;}}
function notify(message){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),3000);}
function element(tag,className,text){const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el;}
function show(view){$('#shop').hidden=view!=='shop';$('#seller').hidden=view!=='seller';window.scrollTo({top:0,behavior:'smooth'});}
function productImage(p){return p.image?.startsWith('data:image/jpeg;base64,')?p.image:`https://images.unsplash.com/${p.image}?auto=format&fit=crop&w=600&q=80`;}
function addToCart(p){if(accountPending||(account.user&&!accountLoaded)||account.expired){notify('Patientez pendant le chargement de votre compte.');return false;}if(!cart[p.id]&&Object.keys(cart).length>=100){notify('Votre panier peut contenir 100 produits différents maximum.');return false;}cart[p.id]=Math.min((cart[p.id]||0)+1,999);persistCart();renderCart();notify('Une belle trouvaille ajoutée au panier');return true;}
function openProduct(p){const dialog=$('#product-details');$('#detail-title').textContent=p.name;$('#detail-store').textContent=`Vendu par ${p.store}`;$('#detail-category').textContent=p.category;$('#detail-price').textContent=currency(p.price);$('#detail-description').textContent=typeof p.description==='string'&&p.description.trim()?p.description:'Le vendeur n’a pas encore renseigné de description.';const photo=$('#detail-photo');photo.replaceChildren();if(p.image){const img=element('img');img.src=productImage(p);img.alt=p.name;photo.append(img);}else{photo.append(element('span',null,'Photo non disponible'));}$('#detail-add').onclick=()=>{if(addToCart(p))$('#detail-status').textContent='Produit ajouté au panier.';};$('#detail-status').textContent='';dialog.showModal();}
$('#close-details').onclick=()=>$('#product-details').close();
$('#product-details').addEventListener('click',event=>{if(event.target!==event.currentTarget)return;const bounds=event.currentTarget.getBoundingClientRect();if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)event.currentTarget.close();});
function render(){const query=$('#search').value.toLocaleLowerCase('fr');const list=products.filter(p=>(category==='Tous'||p.category===category)&&`${p.name} ${p.store}`.toLocaleLowerCase('fr').includes(query));$('#products').replaceChildren();$('#results').textContent=`${list.length} trouvailles`;for(const p of list){const card=element('article','product');const picture=element('button','product-img product-open');picture.type='button';picture.setAttribute('aria-label',`Voir les détails de ${p.name}`);picture.onclick=()=>openProduct(p);if(p.image){const img=element('img');img.src=productImage(p);img.alt=p.name;img.loading='lazy';picture.append(img);}else picture.append(element('span',null,'✳'));picture.append(element('span','product-tag',p.category));const bottom=element('div','product-bottom');const add=element('button','add','+');add.setAttribute('aria-label',`Ajouter ${p.name} au panier`);add.onclick=()=>addToCart(p);bottom.append(element('strong',null,currency(p.price)),add);card.append(picture,element('p','product-store',p.store),element('h3',null,p.name),bottom);if(!initial.some(item=>item.id===p.id)&&!importedIds.has(p.id)){const remove=element('button','delete-product','Supprimer mon produit');remove.setAttribute('aria-label',`Supprimer ${p.name}`);remove.onclick=()=>{if(accountPending||(account.user&&!accountLoaded)||account.expired){notify('Patientez pendant le chargement de votre compte.');return;}if(!window.confirm(`Supprimer « ${p.name} » de ce navigateur ? Cette action est définitive.`))return;const remaining=products.filter(item=>item.id!==p.id);const persisted=save('marchea-products',remaining.filter(item=>!initial.some(original=>original.id===item.id)&&!importedIds.has(item.id)));if(!persisted){notify('Suppression non enregistrée : le stockage du navigateur est indisponible. Réessayez.');return;}products=remaining;delete cart[p.id];const cartSaved=persistCart();render();renderCart();notify(cartSaved?'Produit et photo supprimés de ce navigateur.':'Produit supprimé. Le panier n’a pas pu être enregistré.');};card.append(remove);}$('#products').append(card);}if(!list.length)$('#products').append(element('p',null,'Aucun produit trouvé. Essayez une autre recherche.'));document.querySelectorAll('.categories button').forEach(b=>b.classList.toggle('active',b.dataset.category===category));}
function renderCart(){$('#cart-items').replaceChildren();let total=0,count=0;for(const p of products){const quantity=cart[p.id]||0;if(!quantity)continue;count+=quantity;total+=Math.round(p.price*100)*quantity;const row=element('div','cart-row');const info=element('div',null,p.name);info.append(element('small',null,`${quantity} × ${currency(p.price)}`));const remove=element('button',null,'Retirer');remove.setAttribute('aria-label',`Retirer ${p.name}`);remove.onclick=()=>{removeFromCart(p.id);};row.append(info,remove);$('#cart-items').append(row);}if(!count)$('#cart-items').append(element('p',null,'Votre panier attend ses premières trouvailles.'));$('#count').textContent=count;$('#total').textContent=currency(total/100);renderAccountCart();}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>show(b.dataset.view));document.querySelectorAll('[data-category]').forEach(b=>b.onclick=()=>{category=b.dataset.category;show('shop');render();$('#collection').scrollIntoView({behavior:'smooth'});});$('#search').oninput=render;$('#discover').onclick=()=>$('#collection').scrollIntoView({behavior:'smooth'});$('#cart-button').onclick=()=>$('#cart').showModal();$('#close-cart').onclick=$('#continue').onclick=()=>$('#cart').close();
const photoInput=$('#product-photo');
let previewUrl=null;
function clearPhoto(){if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=null;photoInput.value='';photoInput.setCustomValidity('');$('#photo-preview').hidden=true;$('#photo-preview-image').removeAttribute('src');$('#photo-status').textContent='';}
function photoError(file){if(!['image/jpeg','image/png','image/webp'].includes(file.type))return 'Choisissez une photo JPG, PNG ou WebP.';if(file.size>5*1024*1024)return 'La photo dépasse 5 Mo. Choisissez une image plus légère.';return '';}
photoInput.onchange=()=>{if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=null;$('#photo-preview').hidden=true;$('#photo-status').textContent='';photoInput.setCustomValidity('');const file=photoInput.files[0];if(!file)return;const error=photoError(file);if(error){photoInput.setCustomValidity(error);$('#photo-status').textContent=error;return;}previewUrl=URL.createObjectURL(file);$('#photo-preview-image').src=previewUrl;$('#photo-preview').hidden=false;};
$('#remove-photo').onclick=clearPhoto;
async function preparePhoto(file){if(!file||!file.size)return null;const error=photoError(file);if(error)throw new Error(error);let bitmap;try{bitmap=await createImageBitmap(file);}catch{throw new Error('Cette photo est illisible. Choisissez une autre image.');}try{const scale=Math.min(1,800/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));const context=canvas.getContext('2d');if(!context)throw new Error('Votre navigateur ne permet pas de préparer cette photo.');context.fillStyle='#ffffff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height);const image=canvas.toDataURL('image/jpeg',.75);if(image.length>=500000)throw new Error('Cette photo reste trop volumineuse. Choisissez une image plus simple.');return image;}finally{bitmap.close();}}
$('#seller-form').onsubmit=async e=>{e.preventDefault();const form=e.currentTarget;const data=new FormData(form);const name=data.get('name').trim(),store=data.get('store').trim(),description=data.get('description').trim(),price=Number(data.get('price'));if(!name||!store||!description||!Number.isFinite(price)||price<.01||price>100000){$('#seller-status').textContent='Veuillez remplir tous les champs avec un prix valide.';return;}const submit=form.querySelector('[type="submit"]');submit.disabled=true;photoInput.disabled=true;$('#remove-photo').disabled=true;$('#seller-status').textContent='Préparation du produit…';try{const image=await preparePhoto(data.get('photo'));const product={id:crypto.randomUUID(),name,store,description,image,price:Math.round(price*100)/100,category:data.get('category')};products.push(product);const persisted=save('marchea-products',products.filter(p=>!initial.some(i=>i.id===p.id)&&!importedIds.has(p.id)));form.reset();clearPhoto();$('#seller-status').textContent=persisted?'Produit et photo enregistrés dans ce navigateur. Retrouvez-les dans la boutique.':'Produit ajouté pour cette session uniquement : le stockage local est indisponible ou plein.';render();notify('Votre produit a rejoint la collection de démonstration');}catch(error){$('#seller-status').textContent=error.message||'Impossible de préparer la photo. Réessayez avec une autre image.';}finally{submit.disabled=false;photoInput.disabled=false;$('#remove-photo').disabled=false;}};render();renderCart();

function cartItems(){return normalizeItems(products.filter(p=>cart[p.id]).map(p=>({product:p,quantity:cart[p.id]})));}
function removeFromCart(id){if(accountPending||(account.user&&!accountLoaded)||account.expired){notify('Patientez pendant le chargement de votre compte.');return;}delete cart[id];persistCart();renderCart();}
function setAccountStatus(message){$('#account-status').textContent=message;$('#cart-account-hint').textContent=message;}
function persistCart(){
  if(!account.user)return save('marchea-cart',cart);
  if(!accountLoaded)return false;
  const items=cartItems(),epoch=accountEpoch,revision=++syncRevision;syncPending++;
  setAccountStatus('Enregistrement de votre panier…');
  syncQueue=syncQueue.then(async()=>{
    if(epoch!==accountEpoch){syncPending--;return;}
    try{await account.saveCart(items);if(epoch!==accountEpoch)return;syncFailed=false;if(revision===syncRevision){setAccountStatus('Panier enregistré dans votre compte.');$('#account-retry').hidden=true;}}
    catch(error){if(epoch!==accountEpoch)return;syncFailed=true;setAccountStatus(error.message+' Les changements ne sont pas encore enregistrés en ligne.');$('#account-retry').hidden=false;renderAccount();}
    finally{syncPending--;}
  });
  return true;
}
function renderAccountCart(){
  const container=$('#account-cart-items');container.replaceChildren();let total=0;
  if(account.user&&accountLoaded){for(const item of cartItems()){const p=item.product;const row=element('div','cart-row');const info=element('div',null,p.name);info.append(element('small',null,`${item.quantity} × ${currency(p.price)}`));const remove=element('button',null,'Retirer');remove.onclick=()=>removeFromCart(p.id);remove.setAttribute('aria-label',`Retirer ${p.name} de mes produits sélectionnés`);row.append(info,remove);container.append(row);total+=Math.round(p.price*100)*item.quantity;}if(!Object.keys(cart).length)container.append(element('p',null,'Votre sélection est encore vide. Ajoutez des produits depuis la boutique.'));}
  $('#account-total').textContent=currency(total/100);
}
function renderAccount(){
  $('#account-unavailable').hidden=account.configured;
  $('#account-forms').hidden=!account.configured||(Boolean(account.user)&&!account.expired)||accountPending;
  $('#account-profile').hidden=!account.user||account.expired;
  $('#account-button').textContent=account.user?'Mon compte ●':'Mon compte';
  $('#account-welcome').textContent=account.user?`Connecté : ${account.user.email||'votre compte'}`:'';
  $('#cart-account').textContent=account.user?'Voir mes produits sélectionnés':'Me connecter pour retrouver mon panier';
  $('#account-submit').disabled=accountPending;
  $('#logout').disabled=accountPending;
  renderAccountCart();
}
function switchAccountMode(mode){accountMode=mode;$('#account-name-label').hidden=mode!=='signup';$('#account-name').required=mode==='signup';$('#account-password').minLength=mode==='signup'?12:1;$('#account-password').autocomplete=mode==='signup'?'new-password':'current-password';$('#password-help').hidden=mode!=='signup';$('#account-submit').textContent=mode==='signup'?'Créer mon compte':'Se connecter';for(const [id,value] of [['login-tab','login'],['signup-tab','signup']]){$('#'+id).classList.toggle('active',mode===value);$('#'+id).setAttribute('aria-pressed',String(mode===value));}$('#account-status').textContent='';}
function openAccount(){renderAccount();$('#account-dialog').showModal();}
$('#account-button').onclick=openAccount;
$('#close-account').onclick=()=>$('#account-dialog').close();
$('#cart-account').onclick=()=>{$('#cart').close();openAccount();};
$('#login-tab').onclick=()=>switchAccountMode('login');
$('#signup-tab').onclick=()=>switchAccountMode('signup');
async function loadAccount(){
  accountPending=true;accountLoaded=false;products=products.filter(p=>!importedIds.has(p.id));importedIds.clear();cart={};render();renderCart();renderAccount();setAccountStatus('Chargement de votre panier…');
  try{
    const items=mergeItems(await account.loadCart(),pendingGuest);
    for(const item of items){if(!products.some(p=>p.id===item.product.id)){products.push(item.product);importedIds.add(item.product.id);}}
    cart=Object.fromEntries(items.map(item=>[item.product.id,item.quantity]));
    if(pendingGuest.length){await account.saveCart(items);try{localStorage.removeItem('marchea-cart');}catch{}}
    pendingGuest=[];accountLoaded=true;syncFailed=false;$('#account-retry').hidden=true;setAccountStatus('Votre panier est lié à votre compte.');render();renderCart();
  }catch(error){setAccountStatus(error.message);$('#account-retry').hidden=false;}
  finally{accountPending=false;renderAccount();}
}
$('#account-form').onsubmit=async event=>{
  event.preventDefault();if(accountPending)return;accountPending=true;renderAccount();setAccountStatus(accountMode==='signup'?'Création de votre compte…':'Connexion…');
  const form=event.currentTarget;const data=new FormData(form);pendingGuest=account.user?[]:cartItems();
  try{
    if(accountMode==='signup'){
      if(!String(data.get('name')).trim()){setAccountStatus('Renseignez votre nom.');return;}
      const connected=await account.signUp(String(data.get('email')).trim(),String(data.get('password')),String(data.get('name')).trim());
      if(!connected){setAccountStatus('Si votre inscription est acceptée, vous recevrez un e-mail de confirmation. Confirmez votre adresse puis revenez vous connecter. Si vous avez déjà un compte, utilisez « Se connecter ».');form.reset();return;}
    }else{await account.signIn(String(data.get('email')).trim(),String(data.get('password')));}
    form.reset();accountEpoch++;await loadAccount();
  }catch(error){setAccountStatus(error.message);}
  finally{$('#account-password').value='';accountPending=false;renderAccount();}
};
$('#account-retry').onclick=async()=>{if(accountPending)return;if(account.expired){switchAccountMode('login');renderAccount();setAccountStatus('Reconnectez-vous pour retrouver votre panier.');return;}if(!account.user){await restoreAccount();return;}if(accountLoaded)persistCart();else await loadAccount();};
$('#logout').onclick=async()=>{
  if(accountPending)return;
  if(syncFailed&&!window.confirm('Certains changements du panier ne sont pas enregistrés. Vous déconnecter quand même ?'))return;
  accountPending=true;renderAccount();await syncQueue;
  if(syncFailed&&!window.confirm('La synchronisation du panier a échoué. Quitter sans enregistrer les derniers changements ?')){accountPending=false;renderAccount();return;}
  let logoutFailed=false;try{await account.signOut();}catch{logoutFailed=true;}
  accountEpoch++;accountLoaded=false;syncFailed=false;pendingGuest=[];cart={};save('marchea-cart',{});products=products.filter(p=>!importedIds.has(p.id));importedIds.clear();accountPending=false;$('#account-retry').hidden=true;setAccountStatus(logoutFailed?'Déconnecté sur cet appareil. La révocation de la session en ligne n’a pas pu être confirmée.':'Vous êtes déconnecté.');render();renderCart();renderAccount();
};
async function restoreAccount(){if(!account.configured){renderAccount();return;}accountPending=true;renderAccount();try{pendingGuest=cartItems();if(await account.restore()){accountEpoch++;await loadAccount();}else{$('#cart-account-hint').textContent='Panier invité : enregistré sur cet appareil uniquement.';}}catch(error){setAccountStatus('La reconnexion a échoué. '+error.message);$('#account-retry').hidden=false;}finally{accountPending=false;renderAccount();}}
window.addEventListener('beforeunload',event=>{if(account.user&&(syncFailed||accountPending||syncPending>0)){event.preventDefault();event.returnValue='';}});
switchAccountMode('login');renderAccount();void restoreAccount();
