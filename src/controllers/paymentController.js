const { processPayment, getTransaction, getUserTransactions } = require('../services/paymentService');
const { enqueuePayment, getJobStatus } = require('../queue/jobQueue');
const logger = require('../utils/logger');

/**
 * POST /api/pay
 * Synchronous payment — waits for result
 */
const pay = async (req, res) => {
  const { userId, amount, method } = req.body;
  const idempotencyKey = req.idempotencyKey;

  logger.info(`Payment request received`, { userId, amount, method, idempotencyKey });

  const result = await processPayment({ userId, amount, method, idempotencyKey });

  // Cache response for idempotency
  if (req.cacheResponse && result) {
    await req.cacheResponse(result);
  }

  const statusCode = result.success ? 200 : 402;
  return res.status(statusCode).json(result);
};

/**
 * POST /api/pay/async
 * Async payment — returns jobId immediately, processes in background
 */
const payAsync = async (req, res) => {
  const { userId, amount, method } = req.body;
  const idempotencyKey = req.idempotencyKey;

  const jobId = await enqueuePayment({ userId, amount, method, idempotencyKey });

  logger.info(`Async payment job enqueued: ${jobId}`, { userId, amount, method });

  return res.status(202).json({
    success: true,
    jobId,
    message: 'Payment queued for processing',
    statusUrl: `/api/pay/job/${jobId}`,
  });
};

/**
 * GET /api/pay/job/:jobId
 * Check status of async payment job
 */
const getJobStatusController = async (req, res) => {
  const { jobId } = req.params;
  const job = await getJobStatus(jobId);

  if (!job) {
    return res.status(404).json({ success: false, error: 'JOB_NOT_FOUND', message: `Job ${jobId} not found` });
  }

  return res.json({ success: true, job });
};

/**
 * GET /api/pay/:transactionId
 * Get transaction by ID
 */
const getTransactionController = async (req, res) => {
  const { transactionId } = req.params;
  const transaction = await getTransaction(transactionId);

  if (!transaction) {
    return res.status(404).json({ success: false, error: 'NOT_FOUND', message: `Transaction ${transactionId} not found` });
  }

  return res.json({ success: true, transaction });
};

/**
 * GET /api/pay/user/:userId
 * Get all transactions for a user
 */
const getUserTransactionsController = async (req, res) => {
  const { userId } = req.params;
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const offset = parseInt(req.query.offset) || 0;

  const transactions = await getUserTransactions(userId, limit, offset);
  return res.json({ success: true, count: transactions.length, transactions });
};

module.exports = { pay, payAsync, getJobStatusController, getTransactionController, getUserTransactionsController };
