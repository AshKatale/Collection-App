const express = require('express');
const router = express.Router();
const {
  dailyReport,
  monthlyReport,
  yearlyReport,
  customerReport,
  exportReport,
} = require('../controllers/reportController');
const auth = require('../middleware/auth');

router.use(auth);

// All reports are automatically scoped to what the caller may see
// (a Collector only ever sees their own entries).
router.get('/daily', dailyReport);
router.get('/monthly', monthlyReport);
router.get('/yearly', yearlyReport);
router.get('/customer/:id', customerReport);
router.get('/customer', customerReport);

// Excel / PDF download
router.get('/export', exportReport);

module.exports = router;
