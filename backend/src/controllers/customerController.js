const prisma = require('../db');
const { parsePositiveAmount } = require('../utils/helpers');

const DEFAULT_FIELDS = ['defaultSavings', 'defaultLoan', 'defaultInterest'];

/** '' / null -> null, valid positive number -> number, otherwise undefined (invalid) */
const parseDefaultAmount = (v) => {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  const a = parsePositiveAmount(v);
  return a === null ? undefined : a;
};


/**
 * GET /api/customers
 * Collector: assigned customers only.
 * Owner: their own customers.
 * Admin: all.
 */
const listCustomers = async (req, res) => {
  try {
    const user = req.user;
    let customers;

    if (user.role === 'ADMIN') {
      customers = await prisma.customer.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
        include: {
          assignments: { select: { collectorId: true } },
        },
      });
    } else if (user.role === 'OWNER') {
      customers = await prisma.customer.findMany({
        where: { ownerId: user.id, isActive: true },
        orderBy: { name: 'asc' },
        include: {
          assignments: { select: { collectorId: true } },
        },
      });
    } else {
      // COLLECTOR – only assigned active customers
      const assignments = await prisma.collectorCustomer.findMany({
        where: {
          collectorId: user.id,
          customer: { isActive: true },
        },
        include: {
          customer: {
            include: { assignments: { select: { collectorId: true } } },
          },
        },
      });
      customers = assignments.map((a) => a.customer);
    }

    return res.json({ success: true, data: customers });
  } catch (err) {
    console.error('List customers error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * POST /api/customers
 * Collector: creates customer under their owner and auto-assigns to themselves.
 * Owner: creates under themselves, optionally assigns to a collector.
 * Admin: can specify ownerId and optional collectorId.
 */
const createCustomer = async (req, res) => {
  try {
    const user = req.user;
    const { phone, address, ownerId, collectorId } = req.body;
    const accountNo = String(req.body.accountNo ?? '').trim();
    const name = String(req.body.name ?? '').trim();

    if (!accountNo || !name) {
      return res.status(400).json({ success: false, message: 'accountNo and name are required' });
    }
    const defaults = {};
    for (const f of DEFAULT_FIELDS) {
      const v = parseDefaultAmount(req.body[f]);
      if (req.body[f] !== undefined && v === undefined) {
        return res.status(400).json({ success: false, message: `${f} must be a positive number` });
      }
      defaults[f] = v ?? null;
    }

    let assignedOwnerId;
    let targetCollectorId = null;

    if (user.role === 'ADMIN') {
      assignedOwnerId = ownerId || user.id;
      if (collectorId) targetCollectorId = collectorId;
    } else if (user.role === 'OWNER') {
      assignedOwnerId = user.id;
      if (collectorId) targetCollectorId = collectorId;
    } else if (user.role === 'COLLECTOR') {
      assignedOwnerId = user.ownerId || user.id;
      targetCollectorId = user.id; // Auto-assign to self
    } else {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    // The three checks are independent: run them together (one round trip instead of three)
    const [owner, collector, existing] = await Promise.all([
      prisma.user.findUnique({
        where: { id: assignedOwnerId },
        select: { role: true, isActive: true },
      }),
      targetCollectorId
        ? prisma.user.findUnique({
            where: { id: targetCollectorId },
            select: { role: true, ownerId: true, isActive: true },
          })
        : null,
      // Same account number is allowed, but not with the same name
      prisma.customer.findFirst({
        where: { ownerId: assignedOwnerId, accountNo, name: { equals: name, mode: 'insensitive' } },
        select: { id: true },
      }),
    ]);
    if (!owner || owner.role !== 'OWNER' || !owner.isActive) {
      return res.status(400).json({ success: false, message: 'A valid active owner is required' });
    }
    if (targetCollectorId) {
      if (!collector || collector.role !== 'COLLECTOR' || !collector.isActive || collector.ownerId !== assignedOwnerId) {
        return res.status(400).json({ success: false, message: 'Collector does not belong to the selected owner' });
      }
    }
    if (existing) {
      return res.status(409).json({ success: false, message: 'A customer with this account number and name already exists' });
    }

    const customer = await prisma.customer.create({
      data: {
        accountNo,
        name,
        phone: phone || null,
        address: address || null,
        ...defaults,
        ownerId: assignedOwnerId,
        ...(targetCollectorId && {
          assignments: {
            create: {
              collectorId: targetCollectorId,
            },
          },
        }),
      },
      include: {
        assignments: true,
      },
    });

    return res.status(201).json({ success: true, data: customer });
  } catch (err) {
    console.error('Create customer error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * PUT /api/customers/:id
 * Owner (own) / Admin.
 */
const updateCustomer = async (req, res) => {
  try {
    const user = req.user;
    const customer = await prisma.customer.findUnique({ where: { id: req.params.id } });
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    if (user.role === 'OWNER' && customer.ownerId !== user.id) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    if (user.role === 'COLLECTOR') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const { name, phone, address, accountNo, isActive } = req.body;
    const data = {};
    if (name !== undefined) {
      if (!String(name).trim()) return res.status(400).json({ success: false, message: 'name cannot be empty' });
      data.name = String(name).trim();
    }
    if (phone !== undefined) data.phone = phone || null;
    if (address !== undefined) data.address = address || null;
    if (accountNo !== undefined) {
      if (!String(accountNo).trim()) return res.status(400).json({ success: false, message: 'accountNo cannot be empty' });
      data.accountNo = String(accountNo).trim();
    }
    if (isActive !== undefined) data.isActive = Boolean(isActive);
    for (const f of DEFAULT_FIELDS) {
      if (req.body[f] === undefined) continue;
      const a = parseDefaultAmount(req.body[f]);
      if (a === undefined) return res.status(400).json({ success: false, message: `${f} must be a positive number` });
      data[f] = a;
    }

    // Duplicate check (same account no + same name for this owner)
    if (data.accountNo !== undefined || data.name !== undefined) {
      const dup = await prisma.customer.findFirst({
        where: {
          id: { not: customer.id },
          ownerId: customer.ownerId,
          accountNo: data.accountNo ?? customer.accountNo,
          name: { equals: data.name ?? customer.name, mode: 'insensitive' },
        },
      });
      if (dup) {
        return res.status(409).json({ success: false, message: 'A customer with this account number and name already exists' });
      }
    }

    // Re-assign collector (owner/admin). '' / null = unassign everyone.
    let newCollectorId;
    if (req.body.collectorId !== undefined) {
      newCollectorId = req.body.collectorId || null;
      if (newCollectorId) {
        const col = await prisma.user.findUnique({
          where: { id: newCollectorId },
          select: { role: true, ownerId: true, isActive: true },
        });
        if (!col || col.role !== 'COLLECTOR' || !col.isActive || col.ownerId !== customer.ownerId) {
          return res.status(400).json({ success: false, message: 'Collector does not belong to this customer\'s owner' });
        }
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.customer.update({ where: { id: req.params.id }, data });
      if (newCollectorId !== undefined) {
        await tx.collectorCustomer.deleteMany({ where: { customerId: row.id } });
        if (newCollectorId) {
          await tx.collectorCustomer.create({ data: { customerId: row.id, collectorId: newCollectorId } });
        }
      }
      return tx.customer.findUnique({ where: { id: row.id }, include: { assignments: true } });
    });

    return res.json({ success: true, data: updated });
  } catch (err) {
    console.error('Update customer error:', err);
    if (err.code === 'P2002') {
      return res.status(409).json({ success: false, message: 'A customer with this account number and name already exists' });
    }
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * DELETE /api/customers/:id
 * If no entries exist: completely delete assignments & customer.
 * If historical entries exist: soft delete (isActive = false) & delete assignments.
 */
const deleteCustomer = async (req, res) => {
  try {
    const user = req.user;
    const customer = await prisma.customer.findUnique({
      where: { id: req.params.id },
      include: {
        _count: {
          select: { entries: true },
        },
      },
    });
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    if (user.role === 'OWNER' && customer.ownerId !== user.id) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    if (user.role === 'COLLECTOR') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Always remove any collector assignments for this customer
    await prisma.collectorCustomer.deleteMany({
      where: { customerId: req.params.id },
    });

    if (!customer._count || customer._count.entries === 0) {
      // No entries: hard delete cleanly
      await prisma.customer.delete({
        where: { id: req.params.id },
      });
      return res.json({ success: true, message: 'Customer deleted permanently' });
    } else {
      // Existing entries: soft delete so historical accounting is preserved
      await prisma.customer.update({
        where: { id: req.params.id },
        data: { isActive: false },
      });
      return res.json({ success: true, message: 'Customer deactivated (archived)' });
    }
  } catch (err) {
    console.error('Delete customer error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

module.exports = { listCustomers, createCustomer, updateCustomer, deleteCustomer };
