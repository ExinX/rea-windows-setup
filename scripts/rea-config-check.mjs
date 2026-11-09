import { run } from './doctor.mjs';
await run('config').catch(error => { console.error(error.message); process.exitCode = 1; });
