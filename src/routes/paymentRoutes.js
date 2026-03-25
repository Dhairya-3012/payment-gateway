const express = require('express');
const router = express.Router();
const rateLimiter = require('../middleware/rateLimiter');
const idempotencyMiddleware = require('../middleware/idempotency');
const { validatePaymentRequest } = require('../middleware/validator');
const {
  pay,
  payAsync,
  getJobStatusController,
  getTransactionController,
  getUserTransactionsController,
} = require('../controllers/paymentController');

// POST /api/pay — sync payment
router.post(
  '/',
  rateLimiter,
  idempotencyMiddleware,
  validatePaymentRequest,
  pay
);

// POST /api/pay/async — async payment (queued)
router.post(
  '/async',
  rateLimiter,
  idempotencyMiddleware,
  validatePaymentRequest,
  payAsync
);

// GET /api/pay/job/:jobId — async job status
router.get('/job/:jobId', getJobStatusController);

// GET /api/pay/user/:userId — user transaction history
router.get('/user/:userId', getUserTransactionsController);

// GET /api/pay/:transactionId — single transaction
router.get('/:transactionId', getTransactionController);

module.exports = router;
