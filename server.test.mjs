import {test} from 'node:test';
import assert from 'node:assert/strict';
import {server} from './server.mjs';
test('le serveur fournit la boutique et ses ressources et refuse les chemins inconnus',async()=>{await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));try{const base=`http://127.0.0.1:${server.address().port}`;const page=await fetch(base);assert.equal(page.status,200);assert.match(await page.text(),/id="seller-form"/);for(const path of ['/app.js','/style.css'])assert.equal((await fetch(base+path)).status,200);assert.equal((await fetch(base+'/package.json')).status,404);}finally{await new Promise(resolve=>server.close(resolve));}});
