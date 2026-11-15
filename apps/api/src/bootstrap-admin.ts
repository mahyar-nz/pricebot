import { Db } from './db.js';
import { hashPassword, email, parse, password } from './security.js';
import { validateEnvironment } from './env.js';
import { z } from 'zod';
validateEnvironment();
const input = parse(z.object({ email, password, name: z.string().min(2).max(100) }), { email: process.env.BOOTSTRAP_ADMIN_EMAIL, password: process.env.BOOTSTRAP_ADMIN_PASSWORD, name: process.env.BOOTSTRAP_ADMIN_NAME ?? 'مدیر سامانه' });
const db = new Db();
try {
  if (await db.user.count({ where: { platformRole: 'SUPER_ADMIN' } })) throw new Error('A super administrator already exists. This bootstrap command cannot reset accounts.');
  if (await db.user.findUnique({ where: { email: input.email } })) throw new Error('Email already belongs to an account. Bootstrap refuses implicit privilege escalation.');
  const encoded = await hashPassword(input.password);
  await db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('bootstrap-super-admin'))`;
    if (await tx.user.count({ where: { platformRole: 'SUPER_ADMIN' } })) throw new Error('A super administrator already exists.');
    const user = await tx.user.create({ data: { email: input.email, name: input.name, passwordHash: encoded, platformRole: 'SUPER_ADMIN', emailVerifiedAt: new Date() } });
    await tx.auditLog.create({ data: { userId: user.id, action: 'admin.bootstrap', detail: { mechanism: 'local-cli' } } });
  });
  console.log('Super administrator created. Credentials were not logged. Remove bootstrap environment variables.');
} finally { await db.$disconnect(); }
