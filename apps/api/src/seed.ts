import { Db } from './db.js';
import { DEFAULT_SETTINGS } from './settings.js';
import { validateEnvironment } from './env.js';
validateEnvironment();
const db = new Db();
try {
  await db.platformSetting.upsert({ where: { key: 'platform' }, create: { key: 'platform', value: DEFAULT_SETTINGS }, update: {} });
  console.log('Platform configuration seeded. No users, credentials, stores, or market observations were created.');
} finally { await db.$disconnect(); }
