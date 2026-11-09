import { run } from './doctor.mjs';
await run('jadx').catch(error => { console.error(error.message); process.exitCode = 1; });
