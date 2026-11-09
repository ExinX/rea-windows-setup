import { run } from './doctor.mjs';
await run('capability').catch(error => { console.error(error.message); process.exitCode = 1; });
