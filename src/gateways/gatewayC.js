const logger = require('../utils/logger');

const GATEWAY_NAME = 'GATEWAY_C';

/**
 * GATEWAY C — Lower success rate (50%), slowest — LAST RESORT fallback
 * Accepts all payment methods, never throws circuit breaker open
 */
const processWithGatewayC = async (payload) => {
  const startTime = Date.now();

  // Slowest (500-1000ms)
  const latency = 500 + Math.random() * 500;
  await new Promise((res) => setTimeout(res, latency));

  // 50% success
  const success = Math.random() < 0.5;

  const responseTime = Date.now() - startTime;

  if (!success) {
    const failureTypes = ['GENERIC_FAILURE', 'PROCESSING_ERROR'];
    const reason = failureTypes[Math.floor(Math.random() * failureTypes.length)];

    logger.warn(`Gateway C (fallback) failed: ${reason}`, { payload, responseTime });
    throw new Error(`Gateway C failure: ${reason}`);
  }

  logger.info(`Gateway C (fallback) SUCCESS`, { responseTime });

  return {
    gateway: GATEWAY_NAME,
    externalTransactionId: `GC_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    responseTime,
    status: 'SUCCESS',
  };
};

module.exports = { processWithGatewayC, GATEWAY_NAME };
