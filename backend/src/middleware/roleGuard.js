/**
 * Factory middleware that restricts access to specific roles.
 * Usage: roleGuard('ADMIN', 'OWNER')
 */
const roleGuard = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    next();
  };
};

/**
 * Prisma WHERE fragment scoping ENTRY queries by the requesting user's role.
 * Soft-deleted entries are always excluded.
 *   ADMIN     -> everything
 *   OWNER     -> own organisation
 *   COLLECTOR -> entries of the customers assigned to them (whoever recorded them)
 */
const scopeFilter = (req) => {
  const { role, id } = req.user;
  const base = { deletedAt: null };
  if (role === 'ADMIN') return base;
  if (role === 'OWNER') return { ...base, ownerId: id };
  return { ...base, customer: { assignments: { some: { collectorId: id } } } };
};

module.exports = { roleGuard, scopeFilter };
