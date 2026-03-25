const db = require('../../config/database');
const { getBreaker } = require('../utils/circuitBreaker');
const { processWithGatewayA } = require('./gatewayA');
const { processWithGatewayB } = require('./gatewayB');
const { processWithGatewayC } = require('./gatewayC');
const logger = require('../utils/logger');

/**
 * INTELLIGENT ROUTING
 * 
 * Decision tree:
 * 1. Filter out OPEN circuit breakers (skip broken gateways)
 * 2. Prefer gateway with highest success rate from DB stats
 * 3. Factor in payment method compatibility
 * 4. Fallback: next best gateway
 */

// Gateway functions map
const GATEWAY_FUNCTIONS = {
  GATEWAY_A: processWithGatewayA,
  GATEWAY_B: processWithGatewayB,
  GATEWAY_C: processWithGatewayC,
};

// Payment method preferences
const METHOD_GATEWAY_PREFERENCE = {
  UPI: ['GATEWAY_A', 'GATEWAY_B', 'GATEWAY_C'],
  CARD: ['GATEWAY_A', 'GATEWAY_C', 'GATEWAY_B'],
  NETBANKING: ['GATEWAY_B', 'GATEWAY_A', 'GATEWAY_C'],
  WALLET: ['GATEWAY_B', 'GATEWAY_A', 'GATEWAY_C'],
};

/**
 * Get ranked gateways based on real-time success rates + circuit breaker state
 */
const getRankedGateways = async (method) => {
  // Get live stats from DB
  const { rows: stats } = await db.query(
    `SELECT gateway_name, total_requests, successful_requests, failed_requests
     FROM gateway_stats`
  );

  const methodPreference = METHOD_GATEWAY_PREFERENCE[method] || ['GATEWAY_A', 'GATEWAY_B', 'GATEWAY_C'];

  // Build ranked list
  const scored = stats.map((row) => {
    const breaker = getBreaker(row.gateway_name);
    const cbStatus = breaker.getStatus();

    // Calculate success rate (default 100% for new gateways)
    const successRate =
      row.total_requests > 0
        ? row.successful_requests / row.total_requests
        : 1.0;

    // Method preference bonus (higher = preferred)
    const methodRank = methodPreference.indexOf(row.gateway_name);
    const methodBonus = methodRank === 0 ? 0.15 : methodRank === 1 ? 0.05 : 0;

    return {
      name: row.gateway_name,
      successRate,
      score: successRate + methodBonus,
      circuitState: cbStatus.state,
      isAvailable: cbStatus.state !== 'OPEN',
    };
  });

  // Filter available, sort by score descending
  const available = scored
    .filter((g) => g.isAvailable)
    .sort((a, b) => b.score - a.score);

  logger.debug('Gateway ranking:', available.map((g) => `${g.name}(${(g.score * 100).toFixed(1)}%)`));

  return available;
};

/**
 * Execute payment through a gateway with circuit breaker
 */
const executeWithGateway = async (gatewayName, payload) => {
  const breaker = getBreaker(gatewayName);
  const fn = GATEWAY_FUNCTIONS[gatewayName];

  return breaker.call(() => fn(payload));
};

/**
 * Update gateway stats in DB after each attempt
 */
const updateGatewayStats = async (gatewayName, success, responseTime) => {
  await db.query(
    `UPDATE gateway_stats
     SET
       total_requests = total_requests + 1,
       successful_requests = successful_requests + $1,
       failed_requests = failed_requests + $2,
       avg_response_time_ms = (avg_response_time_ms * total_requests + $3) / (total_requests + 1),
       last_failure_at = CASE WHEN $2 = 1 THEN NOW() ELSE last_failure_at END
     WHERE gateway_name = $4`,
    [success ? 1 : 0, success ? 0 : 1, responseTime, gatewayName]
  );
};

/**
 * Main router: tries gateways in intelligent order
 */
const routePayment = async (payload) => {
  const ranked = await getRankedGateways(payload.method);

  if (ranked.length === 0) {
    throw new Error('All payment gateways are currently unavailable (circuits OPEN)');
  }

  let lastError;

  for (const gateway of ranked) {
    const startTime = Date.now();
    logger.info(`Trying gateway: ${gateway.name} (score: ${(gateway.score * 100).toFixed(1)}%)`);

    try {
      const result = await executeWithGateway(gateway.name, payload);
      const responseTime = Date.now() - startTime;

      await updateGatewayStats(gateway.name, true, responseTime);
      return result;
    } catch (err) {
      const responseTime = Date.now() - startTime;
      await updateGatewayStats(gateway.name, false, responseTime);

      logger.warn(`Gateway ${gateway.name} failed, trying next...`, { error: err.message });
      lastError = err;
    }
  }

  throw new Error(`All gateways failed. Last error: ${lastError.message}`);
};

module.exports = { routePayment, getRankedGateways };
