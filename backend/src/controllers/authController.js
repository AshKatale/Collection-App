const prisma = require('../db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const MIN_PASSWORD = 6;
const normalizeEmail = (e) => (typeof e === 'string' ? e.trim().toLowerCase() : '');


/**
 * POST /api/auth/login
 * Body: { email, password }
 */
const login = async (req, res) => {
  try {
    const { password } = req.body;
    const email = normalizeEmail(req.body.email);
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, name: user.name, role: user.role, ownerId: user.ownerId },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          ownerId: user.ownerId,
        },
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * POST /api/auth/register
 * Admin can create OWNER or COLLECTOR.
 * Owner can create COLLECTOR under themselves.
 * Body: { name, email, password, phone?, role, ownerId? }
 */
const register = async (req, res) => {
  try {
    const { name, password, phone, role, ownerId } = req.body;
    const email = normalizeEmail(req.body.email);
    const currentUser = req.user;

    if (!name || !email || !password || !role) {
      return res.status(400).json({ success: false, message: 'name, email, password, and role are required' });
    }
    if (!['ADMIN', 'OWNER', 'COLLECTOR'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role' });
    }
    if (String(password).length < MIN_PASSWORD) {
      return res.status(400).json({ success: false, message: `Password must be at least ${MIN_PASSWORD} characters` });
    }

    // Permission checks
    if (currentUser.role === 'COLLECTOR') {
      return res.status(403).json({ success: false, message: 'Collectors cannot create users' });
    }

    if (currentUser.role === 'OWNER') {
      // Owners can only create collectors under themselves
      if (role !== 'COLLECTOR') {
        return res.status(403).json({ success: false, message: 'Owners can only create Collectors' });
      }
    }

    if (role === 'ADMIN' && currentUser.role !== 'ADMIN') {
      return res.status(403).json({ success: false, message: 'Only Admin can create Admin users' });
    }

    // Determine the ownerId for the new user
    let assignedOwnerId = null;
    if (role === 'COLLECTOR') {
      if (currentUser.role === 'ADMIN') {
        // Admin must specify ownerId for collectors
        if (!ownerId) {
          return res.status(400).json({ success: false, message: 'ownerId is required when Admin creates a Collector' });
        }
        assignedOwnerId = ownerId;
      } else if (currentUser.role === 'OWNER') {
        assignedOwnerId = currentUser.id;
      }
    }

    // Check for duplicate email
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        phone: phone || null,
        role,
        ownerId: assignedOwnerId,
      },
      select: { id: true, name: true, email: true, phone: true, role: true, ownerId: true, isActive: true, createdAt: true },
    });

    return res.status(201).json({ success: true, data: user });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * GET /api/auth/me
 */
const me = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, name: true, email: true, phone: true, role: true, ownerId: true, isActive: true, createdAt: true },
    });
    return res.json({ success: true, data: user });
  } catch (err) {
    console.error('Me error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * PUT /api/auth/change-password
 * Body: { currentPassword, newPassword }
 */
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'currentPassword and newPassword are required' });
    }
    if (String(newPassword).length < MIN_PASSWORD) {
      return res.status(400).json({ success: false, message: `Password must be at least ${MIN_PASSWORD} characters` });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: req.user.id },
      data: { password: hashedPassword },
    });

    return res.json({ success: true, data: { message: 'Password changed successfully' } });
  } catch (err) {
    console.error('Change password error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

module.exports = { login, register, me, changePassword };
