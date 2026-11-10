const express = require('express');
const router = express.Router();
const { login, register, me, changePassword } = require('../controllers/authController');
const auth = require('../middleware/auth');
const { roleGuard } = require('../middleware/roleGuard');

// Public
router.post('/login', login);

// Authenticated
router.get('/me', auth, me);
router.put('/change-password', auth, changePassword);

// Registration: Admin can register anyone (Admin, Owner, Collector); Owner can register Collector
router.post('/register', auth, roleGuard('ADMIN', 'OWNER'), register);

module.exports = router;

