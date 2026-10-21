import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AccountClient, isPublicConfig, normalizeItems, mergeItems } from './account-client.mjs';
const config = { url: 'https://example-project.supabase.co', publishableKey: 'sb_publishable_publicExample' };
const product = { id: 'vase', name: 'Vase', store: 'Atelier', price: 34, category: 'Maison', description: 'Céramique', image: null };
const items = [{ product, quantity: 2 }];
function session(id='alice',token='alice-access') { return { access_token: token, refresh_token: `${id}-refresh`, expires_in: 3600, user: { id, email: `${id}@example.test` } }; }
function storage() { const values = new Map(); return { getItem: key => values.get(key), setItem: (key,value) => values.set(key,value), removeItem: key => values.delete(key) }; }
function response(data, status = 200) { return new Response(JSON.stringify(data), { status }); }

test('refuse les clés secrètes, les clés service_role et les destinations non Supabase', () => {
  assert.equal(isPublicConfig(config), true);
  for (const key of ['sb_secret_private', `a.${btoa(JSON.stringify({role:'service_role'}))}.c`, '']) assert.equal(isPublicConfig({...config,publishableKey:key}), false);
  assert.equal(isPublicConfig({...config,url:'https://example-project.supabase.co.attacker.test'}), false);
  assert.equal(isPublicConfig({...config,url:'http://example-project.supabase.co'}), false);
});
test('inscription avec confirmation ne crée pas une fausse session et ne conserve pas le mot de passe', async () => {
  let sent;
  const store = storage();
  const client = new AccountClient(config, { storage: store, fetchImpl: async (url, options) => { sent={url,options};return response({user:{id:'alice'}}); } });
  assert.equal(await client.signUp('alice@example.test','a-strong-password','Alice'), false);
  assert.equal(client.user, null);
  assert.match(sent.url,/\/auth\/v1\/signup$/);
  assert.equal(JSON.parse(sent.options.body).data.full_name, 'Alice');
  assert.equal(store.getItem('marchea-account-session'), undefined);
});
test('connexion, panier lié à son utilisateur, restauration sur une nouvelle session et déconnexion', async () => {
  const store=storage(); const rows=new Map(); const requests=[];
  const fetchImpl=async(url,options)=>{
    requests.push({url,options});
    if(url.includes('/token?'))return response(session());
    assert.equal(options.headers.Authorization,'Bearer alice-access');
    if(url.includes('/logout'))return response({});
    if(options.method==='POST') {const row=JSON.parse(options.body);assert.equal(row.user_id,'alice');rows.set(row.user_id,row.items);return response(null);}
    assert.match(url,/user_id=eq.alice&select=items$/);
    return response(rows.has('alice')?[{items:rows.get('alice')}]:[]);
  };
  const client=new AccountClient(config,{storage:store,fetchImpl});
  await client.signIn('alice@example.test','a-strong-password');
  assert.deepEqual(await client.loadCart(),[]);
  await client.saveCart(items);
  assert.deepEqual(await client.loadCart(),normalizeItems(items));
  assert.equal(store.getItem('marchea-account-session'),'alice-refresh');
  const restored=new AccountClient(config,{storage:store,fetchImpl});
  assert.equal(await restored.restore(),true);
  assert.deepEqual(await restored.loadCart(),normalizeItems(items));
  await restored.signOut();assert.equal(restored.user,null);assert.equal(store.getItem('marchea-account-session'),undefined);
  await assert.rejects(()=>restored.loadCart(),/Connectez-vous/);
});
test('les requêtes des comptes différents portent des identités et jetons distincts', async()=>{
  const calls=[];
  for(const id of ['alice','bob']){
    const client=new AccountClient(config,{fetchImpl:async(url,options)=>{calls.push({url,options});return response([]);}});
    client.setSession(session(id,`${id}-access`));await client.loadCart();
  }
  assert.match(calls[0].url,/eq.alice/);assert.equal(calls[0].options.headers.Authorization,'Bearer alice-access');
  assert.match(calls[1].url,/eq.bob/);assert.equal(calls[1].options.headers.Authorization,'Bearer bob-access');
});
test('un échec réseau de synchronisation est signalé et ne devient pas un succès',async()=>{
  const client=new AccountClient(config,{fetchImpl:async()=>{throw new Error('offline');}});client.setSession(session());
  await assert.rejects(()=>client.saveCart(items),/Connexion impossible/);
});
test('une session expirée conserve son propriétaire sans pouvoir écrire dans le panier invité',async()=>{
  const client=new AccountClient(config,{fetchImpl:async()=>response({error:'invalid_grant'},400),storage:storage()});client.setSession(session());client.session.expires_at=0;
  await assert.rejects(()=>client.loadCart(),/session a expiré/);
  assert.equal(client.expired,true);assert.equal(client.user.id,'alice');
  await assert.rejects(()=>client.saveCart(items),/Reconnectez-vous/);
  await client.signOut();assert.equal(client.user,null);
});
test('le panier valide les données et fusionne sans doubler les quantités existantes',()=>{
  assert.equal(normalizeItems([{product:{...product,image:'javascript:alert(1)'},quantity:1}])[0].product.image,null);
  assert.deepEqual(normalizeItems([{product,quantity:-1},{product:{...product,price:NaN},quantity:1}]),[]);
  assert.equal(mergeItems(items,items)[0].quantity,2);
  assert.equal(mergeItems(items,[{product,quantity:3}])[0].quantity,3);
  assert.equal(mergeItems(items,[{product:{...product,id:'bag'},quantity:1}]).length,2);
});

test('les erreurs d’envoi de confirmation distinguent restriction de destinataire, limite et panne SMTP',async()=>{
  for(const [status,body,expected] of [
    [403,{error_code:'email_address_not_authorized'},/pas encore configuré pour cette adresse/],
    [429,{error_code:'over_email_send_rate_limit'},/limite d’envoi/],
    [500,{code:500,msg:'Error sending confirmation email'},/service d’envoi.*indisponible/],
  ]){
    const client=new AccountClient(config,{fetchImpl:async()=>response(body,status)});
    await assert.rejects(()=>client.signUp('customer@example.test','correct-password','Client'),expected);
    assert.equal(client.user,null);
  }
});
test('le renvoi de confirmation passe par Supabase sans simuler une connexion',async()=>{
  let request;
  const client=new AccountClient(config,{fetchImpl:async(url,options)=>{request={url,options};return response({});}});
  await client.resendConfirmation('customer@example.test');
  assert.match(request.url,/\/auth\/v1\/resend$/);
  assert.deepEqual(JSON.parse(request.options.body),{type:'signup',email:'customer@example.test'});
  assert.equal(client.user,null);
});

test('la connexion fonctionne aussi quand AbortSignal.timeout n’est pas disponible',async t=>{
  t.mock.method(AbortSignal,'timeout',()=>{throw new TypeError('unsupported');});
  let signal;const client=new AccountClient(config,{fetchImpl:async(url,options)=>{signal=options.signal;return response({external:{email:true},mailer_autoconfirm:false});}});
  assert.deepEqual(await client.checkConnection(),{emailEnabled:true,confirmationRequired:true});assert.equal(signal.aborted,false);
});
test('la vérification de connexion n’envoie pas d’e-mail',async()=>{
  let sent;const client=new AccountClient(config,{fetchImpl:async(url,options)=>{sent={url,options};return response({external:{email:true},mailer_autoconfirm:false});}});
  await client.checkConnection();assert.match(sent.url,/\/auth\/v1\/settings$/);assert.equal(sent.options.method,'GET');assert.equal(sent.options.body,undefined);
});

test('la requête conserve le contexte global exigé par le fetch natif du navigateur',async()=>{
  let requested=false;
  function nativeLikeFetch(url,options){
    if(this!==globalThis)throw new TypeError('Illegal invocation');
    requested=true;return Promise.resolve(response({external:{email:true},mailer_autoconfirm:false}));
  }
  const client=new AccountClient(config,{fetchImpl:nativeLikeFetch});
  assert.deepEqual(await client.checkConnection(),{emailEnabled:true,confirmationRequired:true});
  assert.equal(requested,true);
});
