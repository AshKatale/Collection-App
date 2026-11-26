const express = require('express');
const router = express.Router();
const c = require('../controllers/ledgerController');
const auth = require('../middleware/auth');
const { roleGuard } = require('../middleware/roleGuard');

router.use(auth);
router.use(roleGuard('ADMIN', 'OWNER')); // collectors have no access to the ledger

router.get('/customers', c.listLedgerCustomers);
router.get('/:customerId', c.getLedger);
router.get('/:customerId/pdf', c.exportLedger);

for (const [path, type] of [['loans', 'loan'], ['deposits', 'deposit']]) {
  router.post(`/:customerId/${path}`, c.createRecord(type));
  router.put(`/:customerId/${path}/:id`, c.updateRecord(type));
  router.delete(`/:customerId/${path}/:id`, c.cancelRecord(type));
}

router.post('/:customerId/terms', c.addTerm);
router.delete('/:customerId/terms/:id', c.deleteTerm);
router.put('/:customerId/overrides', c.setOverride);
router.put('/:customerId/opening', c.saveOpening);
router.delete('/:customerId/opening', c.deleteOpening);

router.get('/:customerId/settlement-preview', c.previewSettlement);
router.post('/:customerId/settlements', c.createSettlement);
router.delete('/:customerId/settlements/:id', c.cancelSettlement);

module.exports = router;
