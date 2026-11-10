const express = require('express');
const router = express.Router();
const {
  listUsers,
  updateUser,
  deleteUser,
  getDashboardStats
} = require('../controllers/adminController');
const auth = require('../middleware/auth');
const { roleGuard } = require('../middleware/roleGuard');

router.use(auth);
router.use(roleGuard('ADMIN'));

router.get('/users', listUsers);
router.put('/users/:id', updateUser);
router.delete('/users/:id', deleteUser);
router.get('/dashboard', getDashboardStats);

module.exports = router;

