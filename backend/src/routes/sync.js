const express = require('express');
const router = express.Router();
const { pull, push } = require('../controllers/syncController');
const auth = require('../middleware/auth');

// Mobile app only. Every role may sync; each operation is checked against that role's normal rules.
router.use(auth);
router.get('/pull', pull);
router.post('/push', push);

module.exports = router;
