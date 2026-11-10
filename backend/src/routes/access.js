const express = require('express');
const router = express.Router();
const { listAccess, requestAccess, grantAccess, decide, cancelRequest } = require('../controllers/accessController');
const auth = require('../middleware/auth');
const { roleGuard } = require('../middleware/roleGuard');

router.use(auth);
router.get('/', listAccess);
router.post('/', roleGuard('COLLECTOR'), requestAccess);
router.post('/grant', roleGuard('OWNER', 'ADMIN'), grantAccess);
router.put('/:id', roleGuard('OWNER', 'ADMIN'), decide);
router.delete('/:id', roleGuard('COLLECTOR'), cancelRequest);

module.exports = router;
