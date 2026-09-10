import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const n = await p.user.count();
console.log('userCount', n);
const rows = await p.$queryRawUnsafe("select count(*) as c from sqlite_master where type='table'");
console.log('tables', JSON.stringify(rows));
await p.$disconnect();
