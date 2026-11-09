import { run } from './doctor.mjs';
await run('win').catch(error => { console.error(error.message); process.exitCode = 1; });
