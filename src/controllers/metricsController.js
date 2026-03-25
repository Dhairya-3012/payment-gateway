const {
  getOverviewMetrics,
  getTimeSeriesMetrics,
  getGatewayMetrics,
  getRecentTransactions,
  getMethodBreakdown,
  getQueueMetrics,
} = require('../services/metricsService');
const { getAllBreakers, getBreaker } = require('../utils/circuitBreaker');
const { getRankedGateways } = require('../gateways/router');

/**
 * GET /api/metrics
 * Full metrics snapshot for dashboard
 */
const getMetrics = async (req, res) => {
  const [overview, gateways, recentTxns, methodBreakdown, timeSeries, queue] = await Promise.all([
    getOverviewMetrics(),
    getGatewayMetrics(),
    getRecentTransactions(10),
    getMethodBreakdown(),
    getTimeSeriesMetrics(60),
    getQueueMetrics(),
  ]);

  return res.json({
    success: true,
    timestamp: new Date().toISOString(),
    overview,
    gateways,
    recentTransactions: recentTxns,
    methodBreakdown,
    timeSeries,
    queue,
    circuitBreakers: getAllBreakers(),
  });
};

/**
 * GET /api/metrics/gateways
 * Gateway-specific metrics + routing info
 */
const getGatewayMetricsController = async (req, res) => {
  const method = req.query.method || 'UPI';
  const [gateways, ranked] = await Promise.all([
    getGatewayMetrics(),
    getRankedGateways(method),
  ]);

  return res.json({
    success: true,
    gateways,
    routingOrder: ranked.map((g) => ({ name: g.name, score: g.score, circuitState: g.circuitState })),
    circuitBreakers: getAllBreakers(),
  });
};

/**
 * POST /api/metrics/circuit/:gatewayName/reset
 * Admin: manually reset a circuit breaker
 */
const resetCircuitBreaker = async (req, res) => {
  const { gatewayName } = req.params;
  const validGateways = ['GATEWAY_A', 'GATEWAY_B', 'GATEWAY_C'];

  if (!validGateways.includes(gatewayName.toUpperCase())) {
    return res.status(400).json({ success: false, error: 'Invalid gateway name' });
  }

  const breaker = getBreaker(gatewayName.toUpperCase());
  breaker.reset();

  return res.json({ success: true, message: `Circuit breaker reset for ${gatewayName}`, status: breaker.getStatus() });
};

module.exports = { getMetrics, getGatewayMetricsController, resetCircuitBreaker };
