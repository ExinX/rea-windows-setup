import { run } from './doctor.mjs';
await run('lu').catch(error => { console.error(error.message); process.exitCode = 1; });
