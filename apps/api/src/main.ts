import { createApplication } from './app.js';
import { env } from './env.js';
const app = await createApplication();
await app.listen(env.port, process.env.API_HOST ?? '127.0.0.1');
console.log(JSON.stringify({ level: 'info', message: 'Pricing API listening', port: env.port }));
