const { PrismaClient, Prisma } = require('@prisma/client');

// Money columns are Decimal: send them to the browser as plain numbers, not strings.
Prisma.Decimal.prototype.toJSON = function toJSON() {
  return Number(this.toString());
};

// One shared client (= one connection pool) for the whole process.
const prisma = global.__prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') global.__prisma = prisma;

module.exports = prisma;
