const express = require('express');
const router = express.Router();
const {
  listCollectors,
  createCollector,
  updateCollector,
  listCollectorCustomers,
  assignCustomers,
  unassignCustomers
} = require('../controllers/collectorController');
const auth = require('../middleware/auth');
const { roleGuard } = require('../middleware/roleGuard');

router.use(auth);
router.use(roleGuard('OWNER', 'ADMIN'));

router.get('/', listCollectors);
router.post('/', createCollector);
router.put('/:id', updateCollector);
router.get('/:id/customers', listCollectorCustomers);
router.post('/:id/assign', assignCustomers);
router.post('/:id/unassign', unassignCustomers);

module.exports = router;

