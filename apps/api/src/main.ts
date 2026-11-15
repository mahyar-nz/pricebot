import { createApplication } from './app.js';
import { env } from './env.js';
const app = await createApplication();
const port = process.env.VERCEL === '1' && process.env.PORT ? Number(process.env.PORT) : env.port;
await app.listen(port, process.env.API_HOST ?? (process.env.VERCEL === '1' ? '0.0.0.0' : '127.0.0.1'));
console.log(JSON.stringify({ level: 'info', message: 'Pricing API listening', port }));
