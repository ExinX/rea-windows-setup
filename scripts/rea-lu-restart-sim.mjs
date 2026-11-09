import { run } from './doctor.mjs';
await run('restart').catch(error => { console.error(error.message); process.exitCode = 1; });
