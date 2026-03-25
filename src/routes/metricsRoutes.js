const express = require('express');
const router = express.Router();
const { getMetrics, getGatewayMetricsController, resetCircuitBreaker } = require('../controllers/metricsController');

// GET /api/metrics — full snapshot
router.get('/', getMetrics);

// GET /api/metrics/gateways — gateway + routing info
router.get('/gateways', getGatewayMetricsController);

// POST /api/metrics/circuit/:gatewayName/reset — admin reset
router.post('/circuit/:gatewayName/reset', resetCircuitBreaker);

module.exports = router;
