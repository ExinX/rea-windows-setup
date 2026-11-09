import { run } from './doctor.mjs';
await run('audit').catch(error => { console.error(error.message); process.exitCode = 1; });
