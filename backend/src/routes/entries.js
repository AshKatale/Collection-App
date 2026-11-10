const express = require('express');
const router = express.Router();
const {
  createEntry,
  createEntriesBatch,
  listEntries,
  entrySummary,
  getEntry,
  entryHistory,
  updateEntry,
  deleteEntry,
} = require('../controllers/entryController');
const auth = require('../middleware/auth');
const { roleGuard } = require('../middleware/roleGuard');

router.use(auth);

// All roles can create / view entries (scoped). Collectors: today's date only (enforced in controller).
router.post('/', createEntry);
router.post('/batch', createEntriesBatch);
router.get('/', listEntries);
router.get('/summary', entrySummary);
router.get('/:id', getEntry);
router.get('/:id/history', roleGuard('OWNER', 'ADMIN'), entryHistory);

// Update / delete: Owner & Admin anywhere in scope; Collector only their own entries of today
// (enforced in controller).
router.put('/:id', updateEntry);
router.delete('/:id', deleteEntry);

module.exports = router;
