import { run } from './doctor.mjs';
await run('smoke').catch(error => { console.error(error.message); process.exitCode = 1; });
