const express = require('express');
const router = express.Router();
const {
  listCustomers,
  createCustomer,
  updateCustomer,
  deleteCustomer
} = require('../controllers/customerController');
const auth = require('../middleware/auth');
const { roleGuard } = require('../middleware/roleGuard');

router.use(auth);

// Collectors can see assigned customers; Owners see theirs; Admin sees all
router.get('/', listCustomers);

// Collectors, Owners, and Admins can create customers
router.post('/', roleGuard('COLLECTOR', 'OWNER', 'ADMIN'), createCustomer);
router.put('/:id', roleGuard('OWNER', 'ADMIN'), updateCustomer);
router.delete('/:id', roleGuard('OWNER', 'ADMIN'), deleteCustomer);

module.exports = router;

