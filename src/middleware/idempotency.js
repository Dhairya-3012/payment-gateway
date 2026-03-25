const redis = require('../../config/redis');
const logger = require('../utils/logger');

/**
 * IDEMPOTENCY MIDDLEWARE
 * 
 * Problem: User clicks "Pay" twice → 2 transactions charged
 * Solution: If same Idempotency-Key seen → return SAME response, skip processing
 * 
 * Storage: Redis (fast) with 24-hour TTL
 * Fallback: PostgreSQL (in service layer for durability)
 * 
 * Key: Idempotency-Key header (client-generated UUID)
 * TTL: 24 hours (industry standard)
 */

const idempotencyMiddleware = async (req, res, next) => {
  const idempotencyKey = req.headers['idempotency-key'];

  // Skip if no key provided (key is optional but recommended)
  if (!idempotencyKey) {
    return next();
  }

  // Validate key format
  if (idempotencyKey.length > 255) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_IDEMPOTENCY_KEY',
      message: 'Idempotency-Key must be 255 characters or less',
    });
  }

  const redisKey = `idempotency:${idempotencyKey}`;

  try {
    const cached = await redis.get(redisKey);

    if (cached) {
      const cachedResponse = JSON.parse(cached);
      logger.info(`Idempotent response returned for key: ${idempotencyKey}`);

      // Return exact same response with header indicating it was replayed
      return res.status(200).json({
        ...cachedResponse,
        idempotent: true,
        message: 'Duplicate request — returning cached response',
      });
    }

    // Store the key and idempotency key on request for later use in controller
    req.idempotencyKey = idempotencyKey;
    req.cacheResponse = async (responseBody) => {
      // Cache for 24 hours
      await redis.setEx(redisKey, 24 * 60 * 60, JSON.stringify(responseBody));
    };

    next();
  } catch (err) {
    logger.error('Idempotency Redis error:', err);
    // Fail open — process request without idempotency guarantee
    next();
  }
};

module.exports = idempotencyMiddleware;
