require('dotenv').config();
const bcrypt = require('bcryptjs');
const prisma = require('../src/db');

async function main() {
  const email = (process.env.ADMIN_EMAIL || 'admin@admin.com').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || 'admin123';

  const admin = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      name: 'Admin',
      email,
      password: await bcrypt.hash(password, 10),
      role: 'ADMIN',
    },
  });

  console.log('Seed completed. Admin user:', admin.email);
  if (!process.env.ADMIN_PASSWORD) {
    console.warn('WARNING: using the default admin password "admin123". Set ADMIN_PASSWORD in .env and/or change it after first login.');
  }
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
