const redis = require('../../config/redis');
const logger = require('../utils/logger');

/**
 * REDIS SLIDING WINDOW RATE LIMITER
 * 
 * Why sliding window over fixed window?
 * Fixed window allows burst at boundaries (e.g., 100 at 0:59 + 100 at 1:00)
 * Sliding window prevents this by tracking requests in a rolling time frame
 * 
 * Implementation:
 * - Key: rate_limit:{userId}
 * - Value: sorted set of timestamps
 * - Score: timestamp (ms)
 */

const rateLimiter = async (req, res, next) => {
  const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000;
  const maxRequests = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100;

  // Identify user (from auth header or IP fallback)
  const userId = req.headers['x-user-id'] || req.body?.userId || req.ip;
  const key = `rate_limit:${userId}`;
  const now = Date.now();
  const windowStart = now - windowMs;

  try {
    // Atomic Redis pipeline
    const pipeline = redis.multi();

    // Remove timestamps outside the current window
    pipeline.zRemRangeByScore(key, '-inf', windowStart);

    // Count remaining requests in window
    pipeline.zCard(key);

    // Add current request timestamp
    pipeline.zAdd(key, { score: now, value: `${now}` });

    // Set key expiry to window duration
    pipeline.expire(key, Math.ceil(windowMs / 1000));

    const results = await pipeline.exec();
    const currentCount = results[1]; // count BEFORE adding current request

    // Set rate limit headers
    const remaining = Math.max(0, maxRequests - currentCount - 1);
    const resetTime = new Date(now + windowMs).toISOString();

    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', resetTime);

    if (currentCount >= maxRequests) {
      logger.warn(`Rate limit exceeded for user: ${userId}`, {
        count: currentCount,
        limit: maxRequests,
      });

      return res.status(429).json({
        success: false,
        error: 'RATE_LIMIT_EXCEEDED',
        message: `Too many requests. Limit: ${maxRequests} per minute.`,
        retryAfter: resetTime,
      });
    }

    next();
  } catch (err) {
    // If Redis fails, fail open (don't block users)
    logger.error('Rate limiter Redis error (failing open):', err);
    next();
  }
};

module.exports = rateLimiter;
