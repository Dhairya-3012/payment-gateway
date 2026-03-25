const logger = require('../utils/logger');

const GATEWAY_NAME = 'GATEWAY_B';

/**
 * GATEWAY B — Medium success rate (65%), supports NETBANKING
 * Best for: NETBANKING, WALLET payments
 */
const processWithGatewayB = async (payload) => {
  const startTime = Date.now();

  // Simulate higher latency (200-600ms)
  const latency = 200 + Math.random() * 400;
  await new Promise((res) => setTimeout(res, latency));

  // Simulate 65% success rate
  const success = Math.random() < 0.65;

  const responseTime = Date.now() - startTime;

  if (!success) {
    const failureTypes = [
      'BANK_SERVER_DOWN',
      'SESSION_EXPIRED',
      'PAYMENT_LIMIT_EXCEEDED',
    ];
    const reason = failureTypes[Math.floor(Math.random() * failureTypes.length)];

    logger.warn(`Gateway B failed: ${reason}`, { payload, responseTime });
    throw new Error(`Gateway B failure: ${reason}`);
  }

  logger.info(`Gateway B SUCCESS`, { responseTime });

  return {
    gateway: GATEWAY_NAME,
    externalTransactionId: `GB_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    responseTime,
    status: 'SUCCESS',
  };
};

module.exports = { processWithGatewayB, GATEWAY_NAME };
