const db = require('../../config/database');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

/**
 * ASYNC JOB QUEUE (Database-backed)
 * 
 * Why async queue?
 * - Heavy payment processing shouldn't block API response
 * - Enables retry without user waiting
 * - Decouples API from processing (better scaling)
 * 
 * In production: Use Bull/BullMQ (Redis-backed) or RabbitMQ
 * Here: PostgreSQL-backed queue (simpler, durable, visible)
 * 
 * Flow:
 *  POST /pay → enqueue job → return jobId → [worker processes async]
 *  GET /pay/status/:jobId → check result
 */

const POLL_INTERVAL_MS = 2000; // Check for new jobs every 2 seconds
let isWorkerRunning = false;

/**
 * Add a payment job to the queue
 */
const enqueuePayment = async (payload) => {
  const jobId = `job_${uuidv4()}`;

  await db.query(
    `INSERT INTO queue_jobs (job_id, payload, status, max_attempts)
     VALUES ($1, $2, 'PENDING', 3)`,
    [jobId, JSON.stringify(payload)]
  );

  logger.info(`Job enqueued: ${jobId}`, { payload });
  return jobId;
};

/**
 * Get job status
 */
const getJobStatus = async (jobId) => {
  const { rows } = await db.query(
    `SELECT job_id, status, attempts, error, payload, created_at, processed_at
     FROM queue_jobs WHERE job_id = $1`,
    [jobId]
  );

  return rows[0] || null;
};

/**
 * Worker: picks up PENDING jobs and processes them
 */
const startWorker = (processPaymentFn) => {
  if (isWorkerRunning) return;
  isWorkerRunning = true;

  logger.info('🔄 Queue worker started');

  const poll = async () => {
    try {
      // Pick one PENDING job (with FOR UPDATE SKIP LOCKED for concurrency safety)
      const { rows } = await db.query(
        `SELECT * FROM queue_jobs
         WHERE status = 'PENDING' AND attempts < max_attempts
         ORDER BY created_at ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED`
      );

      if (rows.length === 0) return; // Nothing to process

      const job = rows[0];
      logger.info(`Processing job: ${job.job_id} (attempt ${job.attempts + 1})`);

      // Mark as PROCESSING
      await db.query(
        `UPDATE queue_jobs SET status = 'PROCESSING', attempts = attempts + 1 WHERE job_id = $1`,
        [job.job_id]
      );

      try {
        const result = await processPaymentFn(JSON.parse(job.payload));

        await db.query(
          `UPDATE queue_jobs
           SET status = 'COMPLETED', processed_at = NOW(),
               payload = payload || $1::jsonb
           WHERE job_id = $2`,
          [JSON.stringify({ result }), job.job_id]
        );

        logger.info(`Job COMPLETED: ${job.job_id}`);
      } catch (err) {
        const isLastAttempt = job.attempts + 1 >= job.max_attempts;

        await db.query(
          `UPDATE queue_jobs
           SET status = $1, error = $2
           WHERE job_id = $3`,
          [isLastAttempt ? 'FAILED' : 'PENDING', err.message, job.job_id]
        );

        logger.warn(`Job ${isLastAttempt ? 'FAILED' : 'will retry'}: ${job.job_id}`, {
          error: err.message,
        });
      }
    } catch (err) {
      logger.error('Queue worker error:', err);
    }
  };

  // Run poll in a transaction to handle SKIP LOCKED
  const wrappedPoll = async () => {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await poll();
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error('Queue transaction error:', err);
    } finally {
      client.release();
    }
  };

  setInterval(wrappedPoll, POLL_INTERVAL_MS);
};

module.exports = { enqueuePayment, getJobStatus, startWorker };
