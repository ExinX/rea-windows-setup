import { spawn } from 'node:child_process';
export function dataOf(result) {
  if (result.structuredContent) return result.structuredContent;
  for (const c of result.content || []) if (c.type === 'text') {
    try { return JSON.parse(c.text); } catch {}
  }
  throw new Error('Expected structured JSON tool evidence');
}
export function checkResult(result) {
  if (!result || result.isError === true) throw new Error('MCP tool failed: ' + JSON.stringify(result));
  for (const c of result.content || []) if (c.type === 'text') {
    let d; try { d = JSON.parse(c.text); } catch { continue; }
    if (d?.error) throw new Error('Tool returned an error: ' + JSON.stringify(d.error));
  }
  if (result.structuredContent?.error) throw new Error(JSON.stringify(result.structuredContent.error));
  return result;
}
export class Client {
  constructor(command, args, env, record, timeout = 900000) {
    this.record = record; this.timeout = timeout; this.pending = new Map(); this.next = 1;
    this.child = spawn(command, args, { env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let buffer = '';
    this.child.stdout.on('data', d => {
      buffer += d.toString();
      let i;
      while ((i = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, i).trim(); buffer = buffer.slice(i + 1);
        if (!line) continue;
        let m; try { m = JSON.parse(line); } catch { this.fail(new Error('Invalid MCP JSON')); continue; }
        const p = this.pending.get(m.id);
        if (p) { this.pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); }
      }
    });
    this.child.stderr.on('data', d => record({ type: 'stderr', text: d.toString() }));
    this.child.on('error', e => { this.closed = e; this.fail(e); });
    this.child.on('exit', (code, signal) => { this.closed = new Error(`Server exited: ${code}/${signal}`); this.fail(this.closed); });
    this.child.stdin.on('error', e => this.fail(e));
  }
  fail(e) { for (const p of this.pending.values()) p.reject(e); this.pending.clear(); }
  rpc(method, params) {
    if (this.closed) return Promise.reject(this.closed);
    const id = this.next++;
    this.record({ type: 'request', id, method, params });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Timeout: ${method}`)); }, this.timeout);
      this.pending.set(id, {
        resolve: result => { clearTimeout(timer); this.record({ type: 'response', id, result }); resolve(result); },
        reject: error => { clearTimeout(timer); this.record({ type: 'error', id, message: error.message }); reject(error); }
      });
      this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }
  notify(method) { this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params: {} }) + '\n'); }
  async call(name, args = {}) { return checkResult(await this.rpc('tools/call', { name, arguments: args })); }
  async close() {
    this.child.stdin.end();
    if (this.closed) return;
    await new Promise(resolve => {
      const timer = setTimeout(() => { this.child.kill(); resolve(); }, 1500);
      this.child.once('exit', () => { clearTimeout(timer); resolve(); });
    });
  }
}
export function availability(names, session) {
  const facts = new Map();
  function walk(o) {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o.names) && typeof o.available === 'boolean') for (const name of o.names) {
      const state = o.available ? 'available' : 'unavailable';
      const prior = facts.get(name);
      facts.set(name, prior && (prior.state === 'unknown' || prior.state !== state) ? { state: 'unknown', reason: 'conflicting_reports' } : { state, reason: o.reason || o.availability_code || null });
    }
    for (const v of Object.values(o)) if (typeof v === 'object') walk(v);
  }
  walk(session);
  return names.map(name => ({ name, ...(facts.get(name) || { state: 'unknown', reason: 'not_reported' }) }));
}
