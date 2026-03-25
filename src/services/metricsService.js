const db = require('../../config/database');
const { getAllBreakers } = require('../utils/circuitBreaker');
const { getRankedGateways } = require('../gateways/router');

/**
 * Aggregates real-time metrics for the dashboard
 */

const getOverviewMetrics = async () => {
  const { rows } = await db.query(`
    SELECT
      COUNT(*)                                            AS total_transactions,
      COUNT(*) FILTER (WHERE status = 'SUCCESS')         AS successful,
      COUNT(*) FILTER (WHERE status = 'FAILED')          AS failed,
      COUNT(*) FILTER (WHERE status = 'PENDING')         AS pending,
      ROUND(AVG(amount)::numeric, 2)                     AS avg_amount,
      ROUND(SUM(amount) FILTER (WHERE status = 'SUCCESS')::numeric, 2) AS total_volume,
      ROUND(
        COUNT(*) FILTER (WHERE status = 'SUCCESS') * 100.0 / NULLIF(COUNT(*), 0), 2
      )                                                  AS success_rate,
      ROUND(AVG(retry_count)::numeric, 2)                AS avg_retries
    FROM transactions
  `);
  return rows[0];
};

const getTimeSeriesMetrics = async (intervalMinutes = 60) => {
  const { rows } = await db.query(`
    SELECT
      DATE_TRUNC('minute', created_at)                        AS bucket,
      COUNT(*)                                                AS total,
      COUNT(*) FILTER (WHERE status = 'SUCCESS')             AS successful,
      COUNT(*) FILTER (WHERE status = 'FAILED')              AS failed,
      ROUND(SUM(amount) FILTER (WHERE status = 'SUCCESS')::numeric, 2) AS volume
    FROM transactions
    WHERE created_at >= NOW() - ($1 || ' minutes')::INTERVAL
    GROUP BY bucket
    ORDER BY bucket ASC
  `, [intervalMinutes]);
  return rows;
};

const getGatewayMetrics = async () => {
  const { rows } = await db.query(`
    SELECT
      gateway_name,
      total_requests,
      successful_requests,
      failed_requests,
      ROUND(avg_response_time_ms::numeric, 0) AS avg_response_time_ms,
      ROUND(
        successful_requests * 100.0 / NULLIF(total_requests, 0), 2
      ) AS success_rate,
      last_failure_at
    FROM gateway_stats
    ORDER BY success_rate DESC NULLS LAST
  `);

  // Merge with circuit breaker state
  const breakers = getAllBreakers();
  return rows.map((row) => {
    const breaker = breakers.find((b) => b.name === row.gateway_name) || {};
    return { ...row, circuitState: breaker.state || 'CLOSED' };
  });
};

const getRecentTransactions = async (limit = 10) => {
  const { rows } = await db.query(`
    SELECT transaction_id, user_id, amount, method, gateway, status, retry_count, created_at
    FROM transactions
    ORDER BY created_at DESC
    LIMIT $1
  `, [limit]);
  return rows;
};

const getMethodBreakdown = async () => {
  const { rows } = await db.query(`
    SELECT
      method,
      COUNT(*)                                           AS total,
      COUNT(*) FILTER (WHERE status = 'SUCCESS')        AS successful,
      ROUND(
        COUNT(*) FILTER (WHERE status = 'SUCCESS') * 100.0 / NULLIF(COUNT(*), 0), 2
      )                                                  AS success_rate,
      ROUND(AVG(amount)::numeric, 2)                     AS avg_amount
    FROM transactions
    GROUP BY method
    ORDER BY total DESC
  `);
  return rows;
};

const getQueueMetrics = async () => {
  const { rows } = await db.query(`
    SELECT
      status,
      COUNT(*) AS count,
      ROUND(AVG(attempts)::numeric, 2) AS avg_attempts
    FROM queue_jobs
    GROUP BY status
  `);
  return rows;
};

module.exports = {
  getOverviewMetrics,
  getTimeSeriesMetrics,
  getGatewayMetrics,
  getRecentTransactions,
  getMethodBreakdown,
  getQueueMetrics,
};
