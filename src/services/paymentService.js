const { v4: uuidv4 } = require('uuid');
const db = require('../../config/database');
const { routePayment } = require('../gateways/router');
const logger = require('../utils/logger');

/**
 * RETRY LOGIC — Exponential Backoff
 *
 * Attempt 1 → fail → wait 1s
 * Attempt 2 → fail → wait 2s
 * Attempt 3 → fail → wait 4s
 * After 3 failures → mark FAILED
 */
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

const withRetry = async (fn, maxAttempts = 3, baseDelayMs = 1000) => {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;
      logger.warn(`Attempt ${attempt}/${maxAttempts} failed: ${err.message}`);

      if (attempt < maxAttempts) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1); // exponential backoff
        logger.info(`Retrying in ${delay}ms...`);
        await sleep(delay);
      }
    }
  }

  throw lastError;
};

/**
 * Core payment processor
 * Called both by sync /pay route and async queue worker
 */
const processPayment = async (payload) => {
  const { userId, amount, method, idempotencyKey } = payload;
  const transactionId = `txn_${uuidv4()}`;
  const maxRetries = parseInt(process.env.MAX_RETRY_ATTEMPTS) || 3;
  const baseDelay = parseInt(process.env.RETRY_BASE_DELAY_MS) || 1000;

  // Insert transaction as PENDING
  await db.query(
    `INSERT INTO transactions
       (transaction_id, user_id, amount, method, gateway, status, idempotency_key)
     VALUES ($1, $2, $3, $4, 'PENDING', 'PENDING', $5)`,
    [transactionId, userId, amount, method, idempotencyKey || null]
  );

  let gatewayResult;
  let retryCount = 0;

  try {
    gatewayResult = await withRetry(
      async (attempt) => {
        retryCount = attempt - 1;
        logger.info(`Payment attempt ${attempt} for txn: ${transactionId}`);
        return await routePayment({ userId, amount, method });
      },
      maxRetries,
      baseDelay
    );
  } catch (err) {
    // All retries exhausted — mark FAILED
    await db.query(
      `UPDATE transactions
       SET status = 'FAILED', retry_count = $1, error_message = $2
       WHERE transaction_id = $3`,
      [retryCount, err.message, transactionId]
    );

    logger.error(`Transaction FAILED after ${retryCount} retries: ${transactionId}`, {
      error: err.message,
    });

    return {
      success: false,
      transactionId,
      status: 'FAILED',
      retryCount,
      error: err.message,
    };
  }

  // SUCCESS — update DB
  await db.query(
    `UPDATE transactions
     SET status = 'SUCCESS',
         gateway = $1,
         retry_count = $2,
         metadata = $3
     WHERE transaction_id = $4`,
    [
      gatewayResult.gateway,
      retryCount,
      JSON.stringify({
        externalTransactionId: gatewayResult.externalTransactionId,
        responseTime: gatewayResult.responseTime,
      }),
      transactionId,
    ]
  );

  logger.info(`Transaction SUCCESS: ${transactionId}`, {
    gateway: gatewayResult.gateway,
    retryCount,
  });

  return {
    success: true,
    transactionId,
    status: 'SUCCESS',
    gateway: gatewayResult.gateway,
    externalTransactionId: gatewayResult.externalTransactionId,
    retryCount,
    amount,
    method,
    userId,
  };
};

/**
 * Fetch a transaction by ID
 */
const getTransaction = async (transactionId) => {
  const { rows } = await db.query(
    `SELECT * FROM transactions WHERE transaction_id = $1`,
    [transactionId]
  );
  return rows[0] || null;
};

/**
 * List transactions for a user
 */
const getUserTransactions = async (userId, limit = 20, offset = 0) => {
  const { rows } = await db.query(
    `SELECT * FROM transactions
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );
  return rows;
};

module.exports = { processPayment, getTransaction, getUserTransactions };
