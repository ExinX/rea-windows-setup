import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const runner=resolve('scripts/rea-win-check.mjs');
test('runner retains full evidence, passes valid WASM evidence, and exits nonzero on tool failure',()=>{
 const dir=mkdtempSync(join(tmpdir(),'rea-run-'));
 try {
  const entry=join(dir,'fake.mjs');
  writeFileSync(entry, `import readline from 'node:readline';for await(const l of readline.createInterface({input:process.stdin})){const m=JSON.parse(l);if(!m.id)continue;let r;if(m.method==='initialize')r={serverInfo:{name:'fixture',version:'6.5.0'},protocolVersion:'2024-11-05'};else if(m.method==='tools/list')r={tools:[]};else if(m.params.name==='inspect_pcap_capture')r={isError:true,content:[{type:'text',text:'packet failure'}]};else if(m.params.name==='inspect_wasm_artifact')r={content:[{type:'text',text:JSON.stringify({evidence_id:'ev_fixture',payload:'x'.repeat(50000)})}]};else {const a=m.params.arguments;r={isError:!(a.left.evidence_id==='ev_fixture'&&a.right.evidence_id==='ev_fixture'&&a.scope==='both'),content:[]};}console.log(JSON.stringify({id:m.id,result:r}));}`);
  const out=join(dir,'runs');
  const r=spawnSync(process.execPath,[runner,'--entry',entry,'--pcap',join(dir,'p.pcap'),'--wasm',join(dir,'a.wasm'),'--output',out],{encoding:'utf8'});
  assert.equal(r.status,1,r.stderr);
  assert.match(r.stdout,/PASS: WASM/);
  const log=readFileSync(join(out,readdirSync(out)[0]),'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(log.find(e=>e.type==='identity').server.version,'6.5.0');
  assert.equal(log.find(e=>e.type==='summary').status,'failed');
  assert.ok(log.some(e=>e.result?.content?.[0]?.text?.length>50000));
 } finally {rmSync(dir,{recursive:true,force:true});}
});
