const prisma = require('../db');
const auth = require('../middleware/auth');
const { todayISO, parseDateOnly, num } = require('../utils/helpers');

const listUsers = async (req, res) => {
  try {
    const { role } = req.query;
    const where = {};
    if (role) where.role = role;

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        ownerId: true,
        isActive: true,
        createdAt: true,
        owner: {
          select: { id: true, name: true, email: true }
        },
        _count: {
          select: { collectors: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ success: true, data: users });
  } catch (error) {
    console.error('listUsers error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching users' });
  }
};

const normalizeEmail = (e) => (typeof e === 'string' ? e.trim().toLowerCase() : '');

const userSelect = { id: true, name: true, email: true, phone: true, role: true, ownerId: true, isActive: true };

const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, role, isActive } = req.body;
    let { email, ownerId } = req.body;

    if (id === req.user.id && ((role !== undefined && role !== 'ADMIN') || isActive === false)) {
      return res.status(400).json({ success: false, message: 'Cannot disable or demote yourself' });
    }
    if (role !== undefined && !['ADMIN', 'OWNER', 'COLLECTOR'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role' });
    }

    const current = await prisma.user.findUnique({ where: { id } });
    if (!current) return res.status(404).json({ success: false, message: 'User not found' });

    const newRole = role !== undefined ? role : current.role;

    // Role <-> owner consistency: only collectors belong to an owner
    if (newRole === 'COLLECTOR') {
      const targetOwnerId = ownerId !== undefined ? ownerId : current.ownerId;
      const owner = targetOwnerId
        ? await prisma.user.findUnique({ where: { id: targetOwnerId }, select: { role: true, isActive: true } })
        : null;
      if (!owner || owner.role !== 'OWNER' || !owner.isActive) {
        return res.status(400).json({ success: false, message: 'A collector needs an active owner (ownerId)' });
      }
      ownerId = targetOwnerId;
    } else {
      ownerId = null;
    }

    // An owner who still has collectors / customers cannot be turned into something else
    if (current.role === 'OWNER' && newRole !== 'OWNER') {
      const [collectors, customers] = await Promise.all([
        prisma.user.count({ where: { ownerId: id, isActive: true } }),
        prisma.customer.count({ where: { ownerId: id } }),
      ]);
      if (collectors || customers) {
        return res.status(400).json({
          success: false,
          message: 'This owner still has collectors or customers. Move or remove them first.',
        });
      }
    }

    const ownerChanged = newRole === 'COLLECTOR' && ownerId !== current.ownerId;

    const deactivating = isActive === false && current.isActive;
    let affected = [id];
    const updated = await prisma.$transaction(async (tx) => {
      // Moving a collector to another owner: drop assignments that belonged to the old owner
      if (ownerChanged || (current.role === 'COLLECTOR' && newRole !== 'COLLECTOR')) {
        await tx.collectorCustomer.deleteMany({ where: { collectorId: id } });
      }
      const row = await tx.user.update({
        where: { id },
        data: {
          ...(name !== undefined && { name }),
          ...(email !== undefined && { email: normalizeEmail(email) }),
          ...(phone !== undefined && { phone: phone || null }),
          ...(role !== undefined && { role }),
          ...(isActive !== undefined && { isActive: Boolean(isActive) }),
          ownerId,
        },
        select: userSelect,
      });
      if (deactivating) affected = await cascadeDeactivate(tx, current);
      return row;
    });
    affected.forEach(auth.invalidateUser); // role / name / active changes take effect at once

    res.json({ success: true, data: updated, message: 'User updated successfully' });
  } catch (error) {
    console.error('updateUser error:', error);
    if (error.code === 'P2002') return res.status(409).json({ success: false, message: 'Email already exists' });
    res.status(500).json({ success: false, message: 'Server error updating user' });
  }
};

/**
 * Deactivating cascades so nothing is left pointing at someone who can no longer work:
 *  - a collector loses their customer assignments;
 *  - an owner's active collectors are deactivated too (and lose their assignments).
 * Entries and customers are never touched. Reactivating a user does NOT restore assignments.
 * Returns the ids whose login cache must be dropped.
 */
async function cascadeDeactivate(tx, target) {
  const affected = [target.id];
  if (target.role === 'OWNER') {
    const collectors = await tx.user.findMany({ where: { ownerId: target.id, role: 'COLLECTOR', isActive: true }, select: { id: true } });
    const ids = collectors.map((c) => c.id);
    if (ids.length) {
      await tx.user.updateMany({ where: { id: { in: ids } }, data: { isActive: false } });
      await tx.collectorCustomer.deleteMany({ where: { collectorId: { in: ids } } });
      affected.push(...ids);
    }
  } else if (target.role === 'COLLECTOR') {
    await tx.collectorCustomer.deleteMany({ where: { collectorId: target.id } });
  }
  return affected;
}

const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    if (id === req.user.id) {
      return res.status(400).json({ success: false, message: 'Cannot deactivate yourself' });
    }

    const target = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true } });
    if (!target) return res.status(404).json({ success: false, message: 'User not found' });

    const affected = await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { isActive: false } });
      return cascadeDeactivate(tx, target);
    });
    affected.forEach(auth.invalidateUser);

    res.json({ success: true, message: 'User deactivated successfully' });
  } catch (error) {
    console.error('deleteUser error:', error);
    res.status(500).json({ success: false, message: 'Server error deactivating user' });
  }
};

const getDashboardStats = async (req, res) => {
  try {
    const today = parseDateOnly(todayISO());
    const [totalUsers, totalOwners, totalCollectors, totalCustomers, agg] = await Promise.all([
      prisma.user.count({ where: { isActive: true } }),
      prisma.user.count({ where: { role: 'OWNER', isActive: true } }),
      prisma.user.count({ where: { role: 'COLLECTOR', isActive: true } }),
      prisma.customer.count({ where: { isActive: true } }),
      prisma.entry.aggregate({
        where: { date: today, deletedAt: null },
        _sum: { amount: true },
        _count: { _all: true },
      }),
    ]);

    res.json({
      success: true,
      data: {
        totalUsers,
        totalOwners,
        totalCollectors,
        totalCustomers,
        todayCount: agg._count._all,
        todayTotal: num(agg._sum.amount),
      },
    });
  } catch (error) {
    console.error('getDashboardStats error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching stats' });
  }
};

module.exports = {
  listUsers,
  updateUser,
  deleteUser,
  getDashboardStats
};
