const logger = require('../utils/logger');

const GATEWAY_NAME = 'GATEWAY_A';

/**
 * GATEWAY A — High success rate (80%), fast response
 * Best for: UPI, CARD payments
 */
const processWithGatewayA = async (payload) => {
  const startTime = Date.now();

  // Simulate network latency (100-400ms)
  const latency = 100 + Math.random() * 300;
  await new Promise((res) => setTimeout(res, latency));

  // Simulate 80% success rate
  const success = Math.random() < 0.8;

  const responseTime = Date.now() - startTime;

  if (!success) {
    // Simulate different failure types
    const failureTypes = [
      'GATEWAY_TIMEOUT',
      'INSUFFICIENT_FUNDS',
      'CARD_DECLINED',
      'NETWORK_ERROR',
    ];
    const reason = failureTypes[Math.floor(Math.random() * failureTypes.length)];

    logger.warn(`Gateway A failed: ${reason}`, { payload, responseTime });
    throw new Error(`Gateway A failure: ${reason}`);
  }

  logger.info(`Gateway A SUCCESS`, { responseTime });

  return {
    gateway: GATEWAY_NAME,
    externalTransactionId: `GA_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    responseTime,
    status: 'SUCCESS',
  };
};

module.exports = { processWithGatewayA, GATEWAY_NAME };
