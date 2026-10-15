import { readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
const root = resolve('dist/client');
const manifest = JSON.parse(readFileSync(resolve(root,'.vite/manifest.json'),'utf8'));
const seen = new Set();
function visit(key) { if(seen.has(key)||!manifest[key])return;seen.add(key);for(const dependency of manifest[key].imports??[])visit(dependency); }
visit('app/page.tsx');
const files = [...seen].map(key=>{const entry=manifest[key],path=resolve(root,entry.file);return {name:key,file:entry.file,bytes:statSync(path).size,gzipBytes:gzipSync(readFileSync(path)).length};});
const report={note:'JavaScript da página da campanha e imports estáticos; não inclui chunks sob demanda, CSS, imagens ou tempos de rede.',files,totalBytes:files.reduce((s,f)=>s+f.bytes,0),gzipBytes:files.reduce((s,f)=>s+f.gzipBytes,0)};
const output=process.argv[2];if(output){mkdirSync(dirname(resolve(output)),{recursive:true});writeFileSync(output,JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify(report,null,2));
