import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client, checkResult, dataOf, availability } from '../scripts/lib/client.mjs';
test('MCP errors and embedded errors cannot pass', () => {
  for (const r of [{ isError:true }, { content:[{type:'text',text:'{"error":{"code":"unavailable"}}'}] }, {structuredContent:{error:'bad'}}]) assert.throws(() => checkResult(r));
  assert.doesNotThrow(() => checkResult({content:[{type:'text',text:'plain output'}]}));
});
test('unknown and conflicting capabilities remain unknown', () => {
  const rows = availability(['a','b','c','d'], {groups:[{names:['a'],available:true},{names:['b'],available:false,reason:'target_required'},{names:['d'],available:true},{names:['d'],available:false}]});
  assert.deepEqual(rows.map(r=>r.state), ['available','unavailable','unknown','unknown']);
  assert.equal(rows[1].reason,'target_required');
});
test('evidence is parsed in full', () => {
  const d = {evidence_id:'ev_test',text:'x'.repeat(50000)};
  assert.deepEqual(dataOf({content:[{type:'text',text:JSON.stringify(d)}]}),d);
});
test('transport preserves response, rejects RPC errors, and handles server exit', async () => {
  const events=[];
  const code = `let b=''; process.stdin.on('data',d=>{b+=d;let i;while((i=b.indexOf('\\n'))>=0){const m=JSON.parse(b.slice(0,i));b=b.slice(i+1);if(m.method==='exit')process.exit(2);else console.log(JSON.stringify({jsonrpc:'2.0',id:m.id,...(m.method==='error'?{error:{code:-1,message:'bad'}}:{result:{content:[{type:'text',text:'x'.repeat(20000)}]}})}));}});`;
  const c=new Client(process.execPath,['-e',code],process.env,e=>events.push(e),2000);
  try {
    assert.equal((await c.call('ok')).content[0].text.length,20000);
    await assert.rejects(c.rpc('error',{}),/bad/);
    await assert.rejects(c.rpc('exit',{}),/exited/);
    assert.equal(events.find(e=>e.type==='response').result.content[0].text.length,20000);
  } finally { await c.close(); }
});
test('tool isError returned inside successful JSON-RPC rejects', async () => {
 const code=`process.stdin.on('data',d=>{for(const l of d.toString().trim().split('\\n')){const m=JSON.parse(l);console.log(JSON.stringify({id:m.id,result:{isError:true,content:[{type:'text',text:'failure'}]}}));}});`;
 const c=new Client(process.execPath,['-e',code],process.env,()=>{},2000);
 try { await assert.rejects(c.call('bad'),/MCP tool failed/); } finally {await c.close();}
});
test('missing executable fails promptly',async()=>{
 const c=new Client('nonexistent-rea-command-9381',[],process.env,()=>{},2000);
 try {await assert.rejects(c.rpc('initialize',{}),/ENOENT/);} finally {await c.close();}
});
test('silent server times out',async()=>{
 const c=new Client(process.execPath,['-e',"process.stdin.resume()"],process.env,()=>{},30);
 try {await assert.rejects(c.rpc('initialize',{}),/Timeout/);} finally {await c.close();}
});
