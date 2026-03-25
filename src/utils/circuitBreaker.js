const logger = require('../utils/logger');

/**
 * CIRCUIT BREAKER PATTERN
 * 
 * States:
 *  CLOSED  → normal operation, requests pass through
 *  OPEN    → gateway is failing, requests are blocked
 *  HALF_OPEN → testing if gateway recovered
 * 
 * Flow:
 *  CLOSED → (too many failures) → OPEN
 *  OPEN   → (timeout elapsed)  → HALF_OPEN
 *  HALF_OPEN → (success) → CLOSED | (failure) → OPEN
 */

const STATE = { CLOSED: 'CLOSED', OPEN: 'OPEN', HALF_OPEN: 'HALF_OPEN' };

class CircuitBreaker {
  constructor(name, options = {}) {
    this.name = name;
    this.state = STATE.CLOSED;

    // Config
    this.failureThreshold = options.failureThreshold || parseInt(process.env.CIRCUIT_BREAKER_THRESHOLD) || 5;
    this.timeoutMs = options.timeoutMs || parseInt(process.env.CIRCUIT_BREAKER_TIMEOUT_MS) || 30000;
    this.halfOpenMaxCalls = options.halfOpenMaxCalls || 2;

    // Counters
    this.failureCount = 0;
    this.successCount = 0;
    this.halfOpenCalls = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;
  }

  /**
   * Wraps a gateway call with circuit breaker logic
   * @param {Function} fn - async function to execute
   */
  async call(fn) {
    if (this.state === STATE.OPEN) {
      // Check if timeout elapsed to try HALF_OPEN
      if (Date.now() >= this.nextAttemptTime) {
        this._transition(STATE.HALF_OPEN);
      } else {
        const waitSec = Math.ceil((this.nextAttemptTime - Date.now()) / 1000);
        throw new Error(`Circuit OPEN for ${this.name}. Retry in ${waitSec}s`);
      }
    }

    if (this.state === STATE.HALF_OPEN) {
      if (this.halfOpenCalls >= this.halfOpenMaxCalls) {
        throw new Error(`Circuit HALF_OPEN for ${this.name}. Too many test calls`);
      }
      this.halfOpenCalls++;
    }

    try {
      const result = await fn();
      this._onSuccess();
      return result;
    } catch (err) {
      this._onFailure();
      throw err;
    }
  }

  _onSuccess() {
    this.failureCount = 0;
    this.successCount++;

    if (this.state === STATE.HALF_OPEN) {
      logger.info(`✅ Circuit RECOVERED for ${this.name} → CLOSED`);
      this._transition(STATE.CLOSED);
    }
  }

  _onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === STATE.HALF_OPEN) {
      logger.warn(`⚡ Circuit test FAILED for ${this.name} → back to OPEN`);
      this._transition(STATE.OPEN);
      return;
    }

    if (this.failureCount >= this.failureThreshold) {
      logger.error(`🔴 Circuit OPENED for ${this.name} after ${this.failureCount} failures`);
      this._transition(STATE.OPEN);
    }
  }

  _transition(newState) {
    this.state = newState;

    if (newState === STATE.OPEN) {
      this.nextAttemptTime = Date.now() + this.timeoutMs;
      this.halfOpenCalls = 0;
    }

    if (newState === STATE.CLOSED) {
      this.failureCount = 0;
      this.halfOpenCalls = 0;
    }

    if (newState === STATE.HALF_OPEN) {
      this.halfOpenCalls = 0;
    }
  }

  getStatus() {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime,
    };
  }

  // Force reset (for testing/admin)
  reset() {
    this._transition(STATE.CLOSED);
    this.successCount = 0;
    logger.info(`🔄 Circuit manually RESET for ${this.name}`);
  }
}

// Singleton registry of breakers per gateway
const breakers = {};

const getBreaker = (gatewayName) => {
  if (!breakers[gatewayName]) {
    breakers[gatewayName] = new CircuitBreaker(gatewayName);
  }
  return breakers[gatewayName];
};

const getAllBreakers = () =>
  Object.values(breakers).map((b) => b.getStatus());

module.exports = { CircuitBreaker, getBreaker, getAllBreakers };
