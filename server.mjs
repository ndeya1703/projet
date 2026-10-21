import http from 'node:http';
import {readFile} from 'node:fs/promises';
const files={'/account-client.mjs':['account-client.mjs','text/javascript; charset=utf-8'],'/account-config.mjs':['account-config.mjs','text/javascript; charset=utf-8'],'/':['index.html','text/html; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/style.css':['style.css','text/css; charset=utf-8']};
export const server=http.createServer(async(req,res)=>{const file=files[new URL(req.url,'http://localhost').pathname];if(!file){res.writeHead(404);return res.end('Introuvable');}try{const body=await readFile(new URL(file[0],import.meta.url));res.writeHead(200,{'Content-Type':file[1]});res.end(body);}catch{res.writeHead(500);res.end('Erreur serveur');}});
if(process.argv[1]===new URL(import.meta.url).pathname)server.listen(Number(process.env.PORT||3000),'0.0.0.0',()=>console.log('Marchéa démarré sur le port '+(process.env.PORT||3000)));
