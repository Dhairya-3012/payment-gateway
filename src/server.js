require('dotenv').config();
require('express-async-errors');

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const logger = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');
const paymentRoutes = require('./routes/paymentRoutes');
const metricsRoutes = require('./routes/metricsRoutes');
const { processPayment } = require('./services/paymentService');
const { startWorker } = require('./queue/jobQueue');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Ensure logs directory exists ─────────────────────────────────────────────
if (!fs.existsSync('logs')) fs.mkdirSync('logs');

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logger
app.use((req, res, next) => {
  logger.debug(`${req.method} ${req.url}`);
  next();
});

// ── Static dashboard ──────────────────────────────────────────────────────────
app.use('/dashboard', express.static(path.join(__dirname, '../dashboard')));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/pay', paymentRoutes);
app.use('/api/metrics', metricsRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    version: require('../package.json').version,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'NOT_FOUND', message: `Route ${req.url} not found` });
});

// Global error handler
app.use(errorHandler);

// ── Start server ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  logger.info(`🚀 Payment Gateway running on http://localhost:${PORT}`);
  logger.info(`📊 Dashboard: http://localhost:${PORT}/dashboard`);
  logger.info(`❤️  Health:    http://localhost:${PORT}/health`);

  // Start async queue worker
  startWorker(processPayment);
});

module.exports = app;
