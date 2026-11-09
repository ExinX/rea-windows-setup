import { readFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { Client, dataOf, availability } from './lib/client.mjs';
export async function run(mode, argv = process.argv.slice(2)) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) { opts.target ||= argv[i]; continue; }
    const key = argv[i].slice(2);
    if (!['config','version','entry','target','apk','pcap','wasm','wasm-right','output','timeout'].includes(key) || !argv[i+1]) throw new Error(`Invalid option: ${argv[i]}`);
    opts[key] = argv[++i];
  }
  if (opts.timeout && (!Number.isFinite(Number(opts.timeout)) || Number(opts.timeout) <= 0)) throw new Error('--timeout must be a positive finite number');
  let env = { ...process.env }, command, args;
  if (mode === 'restart') {
    if (process.platform !== 'win32') throw new Error('Restart simulation requires Windows');
    env = JSON.parse(execFileSync('powershell.exe', ['-NoProfile','-Command', "$o=@{};foreach($s in @('Machine','User')){foreach($p in [Environment]::GetEnvironmentVariables($s).GetEnumerator()){if($p.Key -ieq 'Path' -and $o.ContainsKey('Path')){$o['Path']=$o['Path']+';'+$p.Value}else{$o[$p.Key]=$p.Value}}};$o|ConvertTo-Json -Compress"], { encoding: 'utf8' }));
  }
  let version = opts.version || process.env.REA_VERSION || (['lu','restart'].includes(mode) ? '6.5.0' : '6.8.0');
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Use an exact REA version');
  if (opts.config || mode === 'config') {
    const cfg = JSON.parse(readFileSync(opts.config || join(homedir(), '.claude.json'), 'utf8').replace(/^\uFEFF/, '')).mcpServers?.rea;
    if (!cfg || typeof cfg.command !== 'string' || !Array.isArray(cfg.args)) throw new Error('Expected mcpServers.rea command and args');
    command = cfg.command; args = cfg.args;
    if (mode === 'config') env = Object.fromEntries(Object.entries(process.env).filter(([k]) => ['systemroot','systemdrive','temp','tmp','userprofile','appdata','localappdata','pathext'].includes(k.toLowerCase())));
    // Windows environment keys are case insensitive; avoid duplicate Path/PATH entries.
    for (const [k,v] of Object.entries(cfg.env || {})) { if (process.platform === 'win32') for (const old of Object.keys(env)) if (old.toLowerCase() === k.toLowerCase()) delete env[old]; env[k] = v; }
    if (opts.version) throw new Error('--version cannot override a configured command; edit its pinned version');
    version = 'configured';
  } else if (opts.entry || process.env.REA_ENTRY) {
    command = process.execPath; args = [resolve(opts.entry || process.env.REA_ENTRY), 'mcp']; version = 'entry';
  } else {
    command = process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : 'npx';
    args = process.platform === 'win32' ? ['/d','/c','npx','-y',`rea-agents@${version}`,'mcp'] : ['-y',`rea-agents@${version}`,'mcp'];
  }
  const out = resolve(opts.output || 'evidence/runs'); mkdirSync(out, { recursive: true });
  const file = join(out, `${new Date().toISOString().replace(/[:.]/g,'-')}-${mode}-${randomUUID()}.jsonl`);
  const record = event => appendFileSync(file, JSON.stringify({ time: new Date().toISOString(), ...event }) + '\n');
  record({ type: 'run', mode, requestedVersion: version, platform: process.platform, arch: process.arch, node: process.version });
  const client = new Client(command, args, env, record, opts.timeout ? Number(opts.timeout) : 900000);
  let failures = 0;
  try {
    const init = await client.rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'rea-windows-doctor', version: '1.0.0' } });
    record({ type: 'identity', server: init.serverInfo, protocol: init.protocolVersion });
    console.log('Server:', JSON.stringify(init.serverInfo));
    if (!init.serverInfo?.version) throw new Error('Server did not report its version');
    if (!['configured','entry'].includes(version) && init.serverInfo.version !== version) throw new Error(`Requested ${version}, connected to ${init.serverInfo.version}`);
    client.notify('notifications/initialized');
    const tools = await client.rpc('tools/list', {});
    if (!Array.isArray(tools.tools)) throw new Error('Missing tool catalog');
    console.log('Advertised tools:', tools.tools.length);
    const attempt = async (name, fn) => { try { await fn(); console.log('PASS:', name); } catch (e) { failures++; record({ type: 'check-failed', name, message: e.message }); console.error('FAIL:', name, e.message); } };
    const required = key => { if (!opts[key]) throw new Error(`Supply --${key} with an existing fixture path`); return resolve(opts[key]); };
    if (mode === 'audit') {
      const rows = availability(tools.tools.map(t => t.name), dataOf(await client.call('binary_session')));
      record({ type: 'availability', rows });
      for (const state of ['available','unavailable','unknown']) console.log(`${state}:`, rows.filter(r => r.state === state).length);
      console.log('Availability is a session report, not a successful execution test. target_required is not proof a tool will work.');
    } else if (['smoke','config','lu','restart'].includes(mode)) {
      const target = opts.target ? resolve(opts.target) : process.platform === 'win32' ? join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'notepad.exe') : required('target');
      await attempt('binary analysis', async () => {
        try {
          await client.call('open_binary', { path: target });
          const overview = dataOf(await client.call('binary_overview'));
          if (!overview.evidence_id) throw new Error('Missing overview evidence');
          await client.call('list_procedures'); await client.call('list_strings');
          // Exercise decompilation explicitly when the user supplies a procedure through a separate investigation.
        } finally { await client.call('close_binary'); }
      });
    } else if (mode === 'jadx' || mode === 'capability') {
      await attempt('Android inspection', async () => { const d = dataOf(await client.call('inspect_android_package', { path: required('apk'), detail: 'summary' })); if (!d.evidence_id) throw new Error('Missing Android evidence'); });
      if (mode === 'capability') {
        await attempt('Android resources', async () => { await client.call('decode_android_resources', { path: required('apk'), include_strings: true }); });
        await attempt('Windows-compatible packet provider', async () => { await client.call('inspect_pcap_capture', { path: required('pcap') }); });
      }
    } else if (mode === 'win') {
      await attempt('Packet inspection', async () => { await client.call('inspect_pcap_capture', { path: required('pcap') }); });
      await attempt('WASM inspection and comparison', async () => {
        const left = dataOf(await client.call('inspect_wasm_artifact', { path: required('wasm') }));
        const right = opts['wasm-right'] ? dataOf(await client.call('inspect_wasm_artifact', { path: resolve(opts['wasm-right']) })) : left;
        if (!left.evidence_id || !right.evidence_id) throw new Error('Missing WASM evidence');
        await client.call('compare_wasm_interfaces', { left, right, scope: 'both' });
      });
    } else throw new Error(`Unknown mode: ${mode}`);
    record({ type: 'summary', status: failures ? 'failed' : 'passed', failures });
    if (failures) process.exitCode = 1;
  } catch (e) { record({ type: 'fatal', message: e.message }); process.exitCode = 1; console.error(e.message); }
  finally { await client.close(); console.log('Full evidence:', file); }
}
