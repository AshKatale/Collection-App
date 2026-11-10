const prisma = require('../db');
const bcrypt = require('bcryptjs');

const normalizeEmail = (e) => (typeof e === 'string' ? e.trim().toLowerCase() : '');


/**
 * GET /api/collectors
 * Owner: their collectors. Admin: all collectors.
 */
const listCollectors = async (req, res) => {
  try {
    const user = req.user;
    const where = { role: 'COLLECTOR' };

    if (user.role === 'OWNER') {
      where.ownerId = user.id;
    }
    // ADMIN sees all collectors

    const collectors = await prisma.user.findMany({
      where,
      select: { id: true, name: true, email: true, phone: true, role: true, ownerId: true, isActive: true, createdAt: true },
      orderBy: { name: 'asc' },
    });

    return res.json({ success: true, data: collectors });
  } catch (err) {
    console.error('List collectors error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * POST /api/collectors
 * Create a collector user under the requesting Owner. Admin can specify ownerId.
 */
const createCollector = async (req, res) => {
  try {
    const user = req.user;
    const { name, password, phone, ownerId } = req.body;
    const email = normalizeEmail(req.body.email);

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'name, email, and password are required' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    let assignedOwnerId;
    if (user.role === 'ADMIN') {
      if (!ownerId) {
        return res.status(400).json({ success: false, message: 'ownerId is required when Admin creates a collector' });
      }
      assignedOwnerId = ownerId;
    } else if (user.role === 'OWNER') {
      assignedOwnerId = user.id;
    } else {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const owner = await prisma.user.findUnique({
      where: { id: assignedOwnerId },
      select: { role: true, isActive: true },
    });
    if (!owner || owner.role !== 'OWNER' || !owner.isActive) {
      return res.status(400).json({ success: false, message: 'ownerId must reference an active owner' });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const collector = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        phone: phone || null,
        role: 'COLLECTOR',
        ownerId: assignedOwnerId,
      },
      select: { id: true, name: true, email: true, phone: true, role: true, ownerId: true, isActive: true, createdAt: true },
    });

    return res.status(201).json({ success: true, data: collector });
  } catch (err) {
    console.error('Create collector error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * PUT /api/collectors/:id
 * Update collector details. Owner (own collectors) / Admin.
 */
const updateCollector = async (req, res) => {
  try {
    const user = req.user;
    const collector = await prisma.user.findUnique({ where: { id: req.params.id } });

    if (!collector || collector.role !== 'COLLECTOR') {
      return res.status(404).json({ success: false, message: 'Collector not found' });
    }

    if (user.role === 'OWNER' && collector.ownerId !== user.id) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const { name, phone, email, isActive, password } = req.body;
    const data = {};
    if (name !== undefined) data.name = name;
    if (phone !== undefined) data.phone = phone;
    if (email !== undefined) data.email = normalizeEmail(email);
    if (isActive !== undefined) data.isActive = Boolean(isActive);
    if (password) {
      if (String(password).length < 6) {
        return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
      }
      data.password = await bcrypt.hash(password, 10);
    }

    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data,
      select: { id: true, name: true, email: true, phone: true, role: true, ownerId: true, isActive: true, createdAt: true },
    });

    return res.json({ success: true, data: updated });
  } catch (err) {
    console.error('Update collector error:', err);
    if (err.code === 'P2002') {
      return res.status(409).json({ success: false, message: 'Email already exists' });
    }
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * GET /api/collectors/:id/customers
 * List assigned customers for this collector.
 */
const listCollectorCustomers = async (req, res) => {
  try {
    const user = req.user;
    const collectorId = req.params.id;

    // Verify collector exists
    const collector = await prisma.user.findUnique({ where: { id: collectorId } });
    if (!collector || collector.role !== 'COLLECTOR') {
      return res.status(404).json({ success: false, message: 'Collector not found' });
    }

    // Scope check
    if (user.role === 'OWNER' && collector.ownerId !== user.id) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    if (user.role === 'COLLECTOR' && collector.id !== user.id) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const assignments = await prisma.collectorCustomer.findMany({
      where: {
        collectorId,
        customer: { isActive: true },
      },
      include: { customer: true },
      orderBy: { customer: { name: 'asc' } },
    });

    const customers = assignments.map((a) => ({
      ...a.customer,
      assignedAt: a.assignedAt,
    }));

    return res.json({ success: true, data: customers });
  } catch (err) {
    console.error('List collector customers error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * POST /api/collectors/:id/assign
 * Assign customers to collector.
 * Body: { customerIds: [...] }
 */
const assignCustomers = async (req, res) => {
  try {
    const user = req.user;
    const collectorId = req.params.id;
    const { customerIds } = req.body;

    if (!customerIds || !Array.isArray(customerIds) || customerIds.length === 0) {
      return res.status(400).json({ success: false, message: 'customerIds array is required' });
    }

    // Verify collector
    const collector = await prisma.user.findUnique({ where: { id: collectorId } });
    if (!collector || collector.role !== 'COLLECTOR') {
      return res.status(404).json({ success: false, message: 'Collector not found' });
    }

    if (user.role === 'OWNER' && collector.ownerId !== user.id) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Verify all customers belong to the right owner
    const customers = await prisma.customer.findMany({
      where: { id: { in: customerIds } },
    });

    if (customers.length !== new Set(customerIds).size || customers.some((c) => c.ownerId !== collector.ownerId)) {
      return res.status(403).json({ success: false, message: 'Some customers do not belong to this collector owner' });
    }

    if (user.role === 'OWNER' && customers.some((c) => c.ownerId !== user.id)) {
      return res.status(403).json({ success: false, message: 'Some customers do not belong to you' });
    }

    // Create assignments (skip existing ones)
    const data = customerIds.map((customerId) => ({
      collectorId,
      customerId,
    }));

    await prisma.collectorCustomer.createMany({
      data,
      skipDuplicates: true,
    });

    return res.json({ success: true, data: { message: `${customerIds.length} customer(s) assigned` } });
  } catch (err) {
    console.error('Assign customers error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * POST /api/collectors/:id/unassign
 * Unassign customers from collector.
 * Body: { customerIds: [...] }
 */
const unassignCustomers = async (req, res) => {
  try {
    const user = req.user;
    const collectorId = req.params.id;
    const { customerIds } = req.body;

    if (!customerIds || !Array.isArray(customerIds) || customerIds.length === 0) {
      return res.status(400).json({ success: false, message: 'customerIds array is required' });
    }

    // Verify collector
    const collector = await prisma.user.findUnique({ where: { id: collectorId } });
    if (!collector || collector.role !== 'COLLECTOR') {
      return res.status(404).json({ success: false, message: 'Collector not found' });
    }

    if (user.role === 'OWNER' && collector.ownerId !== user.id) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    await prisma.collectorCustomer.deleteMany({
      where: {
        collectorId,
        customerId: { in: customerIds },
      },
    });

    return res.json({ success: true, data: { message: `${customerIds.length} customer(s) unassigned` } });
  } catch (err) {
    console.error('Unassign customers error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

module.exports = {
  listCollectors,
  createCollector,
  updateCollector,
  listCollectorCustomers,
  assignCustomers,
  unassignCustomers,
};
