import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {AccountClient, normalizeItems, mergeItems} from './account-client.mjs';
const html=await readFile(new URL('./index.html',import.meta.url),'utf8');
const source=(await readFile(new URL('./app.js',import.meta.url),'utf8')).replace(/^import .* from .*;\n/gm,'');
const config={url:'https://example-project.supabase.co',publishableKey:'sb_publishable_publicExample'};
const nextTick=()=>new Promise(resolve=>setImmediate(resolve));
async function settle(){for(let i=0;i<12;i++)await nextTick();}
function service(){
  const carts=new Map();
  const fetchImpl=async(url,options)=>{
    const reply=(body,status=200)=>new Response(JSON.stringify(body),{status});
    const body=options.body?JSON.parse(options.body):{};
    if(url.includes('/settings'))return reply({external:{email:true},mailer_autoconfirm:false});
    if(url.includes('/resend'))return reply({});
    if(url.includes('/signup'))return reply({user:{id:'new-customer'}});
    if(url.includes('grant_type=password')){
      if(body.password!=='correct-password')return reply({error:'invalid_grant'},400);
      const id=body.email.split('@')[0];return reply({user:{id,email:body.email},access_token:id,refresh_token:`${id}-refresh`,expires_in:3600});
    }
    if(url.includes('/logout'))return reply({});
    const id=options.headers.Authorization?.slice(7);
    if(url.includes('/rest/')){
      if(options.method==='POST'){if(body.user_id!==id)return reply({},403);carts.set(id,body.items);return reply(null);}
      if(!url.includes(`user_id=eq.${id}&`))return reply({},403);
      return reply(carts.has(id)?[{items:carts.get(id)}]:[]);
    }
    return reply({},400);
  };
  return {carts,fetchImpl};
}
async function page(backend,enabled=true){
  const dom=new JSDOM(html,{url:'https://ndeya1703.github.io/projet/',runScripts:'outside-only'});
  const {window}=dom;
  window.scrollTo=()=>{};window.confirm=()=>true;
  window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  window.HTMLDialogElement.prototype.close=function(){this.open=false;};
  class Client extends AccountClient{constructor(settings,options){super(settings,{...options,fetchImpl:backend.fetchImpl});}}
  window.__deps={accountConfig:enabled?config:{url:'',publishableKey:''},AccountClient:Client,normalizeItems,mergeItems};
  window.eval('const {accountConfig,AccountClient,normalizeItems,mergeItems}=window.__deps;\n'+source);
  await settle();return dom;
}
async function login(window,email='alice@example.test',password='correct-password'){
  const document=window.document;document.querySelector('#login-tab').click();
  document.querySelector('#account-email').value=email;document.querySelector('#account-password').value=password;
  document.querySelector('#account-form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));
  await settle();
}
test('sans projet configuré, le compte indique son indisponibilité et le panier invité fonctionne',async()=>{
  const dom=await page(service(),false);try{const d=dom.window.document;d.querySelector('#account-button').click();assert.equal(d.querySelector('#account-dialog').open,true);assert.equal(d.querySelector('#account-unavailable').hidden,false);assert.equal(d.querySelector('#account-forms').hidden,true);d.querySelector('#close-account').click();d.querySelector('.add').click();assert.equal(d.querySelector('#count').textContent,'1');}finally{dom.window.close();}
});
test('inscription avec confirmation affiche les instructions sans inventer un compte connecté',async()=>{
  const dom=await page(service());try{const {window}=dom,d=window.document;d.querySelector('#signup-tab').click();d.querySelector('#account-name').value='Alice';d.querySelector('#account-email').value='alice@example.test';d.querySelector('#account-password').value='correct-password';d.querySelector('#account-form').dispatchEvent(new window.Event('submit',{cancelable:true}));await settle();assert.match(d.querySelector('#account-status').textContent,/e-mail de confirmation/);assert.equal(d.querySelector('#account-profile').hidden,true);assert.equal(d.querySelector('#account-password').value,'');assert.equal(window.sessionStorage.length,0);}finally{dom.window.close();}
});
test('un client retrouve ses produits sur un autre appareil, et un autre compte ne les récupère pas',async()=>{
  const backend=service();const alice=await page(backend);const second=await page(backend);const bob=await page(backend);
  try{
    const d=alice.window.document;d.querySelector('.add').click();await login(alice.window);
    assert.equal(d.querySelector('#account-profile').hidden,false);assert.equal(backend.carts.get('alice')[0].quantity,1);assert.equal(d.querySelectorAll('#account-cart-items .cart-row').length,1);
    d.querySelectorAll('.add')[1].click();await settle();assert.equal(backend.carts.get('alice').length,2);
    d.querySelector('#logout').click();await settle();assert.equal(d.querySelector('#count').textContent,'0');assert.equal(alice.window.localStorage.getItem('marchea-cart'),'{}');
    await login(second.window);assert.equal(second.window.document.querySelector('#count').textContent,'2');assert.equal(second.window.document.querySelectorAll('#account-cart-items .cart-row').length,2);
    await login(bob.window,'bob@example.test');assert.equal(bob.window.document.querySelector('#count').textContent,'0');assert.equal(bob.window.document.querySelectorAll('#account-cart-items .cart-row').length,0);assert.equal(backend.carts.get('alice').length,2);
    second.window.document.querySelector('#account-cart-items button').click();await settle();assert.equal(backend.carts.get('alice').length,1);
  }finally{alice.window.close();second.window.close();bob.window.close();}
});
test('une erreur de connexion garde le formulaire et ne montre pas de profil',async()=>{
  const dom=await page(service());try{await login(dom.window,'alice@example.test','wrong-password');const d=dom.window.document;assert.equal(d.querySelector('#account-profile').hidden,true);assert.equal(d.querySelector('#account-forms').hidden,false);assert.match(d.querySelector('#account-status').textContent,/incorrect/);assert.equal(d.querySelector('#account-password').value,'');}finally{dom.window.close();}
});

test('le client peut redemander sa confirmation après inscription sans créer de session',async()=>{
  const dom=await page(service());try{const {window}=dom,d=window.document;d.querySelector('#signup-tab').click();d.querySelector('#account-name').value='Alice';d.querySelector('#account-email').value='alice@example.test';d.querySelector('#account-password').value='correct-password';d.querySelector('#account-form').dispatchEvent(new window.Event('submit',{cancelable:true}));await settle();const resend=d.querySelector('#resend-confirmation');assert.equal(resend.hidden,false);resend.click();await settle();assert.match(d.querySelector('#account-status').textContent,/un nouveau lien a été demandé/);assert.equal(d.querySelector('#account-profile').hidden,true);}finally{dom.window.close();}
});

test('le bouton de diagnostic indique que le service est joignable',async()=>{
  const dom=await page(service());try{const d=dom.window.document;d.querySelector('#check-account-service').click();await settle();assert.match(d.querySelector('#account-status').textContent,/connexion au service fonctionne/);assert.equal(d.querySelector('#account-profile').hidden,true);}finally{dom.window.close();}
});
