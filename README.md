# ⚡ Payment Gateway Simulator

> A production-grade payment gateway backend simulating idempotency, retry logic, intelligent routing, circuit breakers, rate limiting, async queues, and a real-time metrics dashboard.

---

## 🏗️ Architecture

```
Client
  │
  ▼
Express API (Port 3000)
  ├── Rate Limiter      ← Redis sliding window (100 req/min/user)
  ├── Idempotency       ← Redis + 24hr TTL (prevents duplicate charges)
  ├── Validator         ← Input sanitization
  │
  ▼
Payment Service
  ├── Retry Logic       ← Exponential backoff (3 attempts)
  │
  ▼
Gateway Router (Intelligent Routing)
  ├── Gateway A   ← 80% success, fast   (UPI/CARD preferred)
  ├── Gateway B   ← 65% success, medium (NETBANKING/WALLET preferred)
  └── Gateway C   ← 50% success, slow   (fallback only)
  │
  ▼
Circuit Breaker (per gateway)
  └── CLOSED → OPEN → HALF_OPEN → CLOSED

  ┌─────────────┐    ┌─────────────┐
  │ PostgreSQL  │    │    Redis    │
  │ Transactions│    │ Rate Limit  │
  │ Queue Jobs  │    │ Idempotency │
  │ Gateway Stats│    │             │
  └─────────────┘    └─────────────┘

Async Queue Worker (polls every 2s)
Dashboard (http://localhost:3000/dashboard)
```

---

## 🚀 Quick Start

### Option A — Docker (Recommended)

```bash
# Clone & start everything
git clone <repo>
cd payment-gateway
docker-compose up --build

# Visit dashboard
open http://localhost:3000/dashboard
```

### Option B — Local

```bash
# 1. Start PostgreSQL and Redis manually
# 2. Copy env
cp .env.example .env

# 3. Create DB + tables
psql -U postgres -f docker/init.sql

# 4. Install & run
npm install
npm run dev
```

---

## 📡 API Reference

### POST `/api/pay` — Synchronous Payment

```bash
curl -X POST http://localhost:3000/api/pay \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: unique-key-123" \
  -d '{"userId": "user_1", "amount": 1500, "method": "UPI"}'
```

**Response (success):**
```json
{
  "success": true,
  "transactionId": "txn_abc123",
  "status": "SUCCESS",
  "gateway": "GATEWAY_A",
  "retryCount": 1,
  "amount": 1500,
  "method": "UPI"
}
```

---

### POST `/api/pay/async` — Async Payment (Queue)

```bash
curl -X POST http://localhost:3000/api/pay/async \
  -H "Content-Type: application/json" \
  -d '{"userId": "user_1", "amount": 1500, "method": "CARD"}'
```

**Response:**
```json
{ "success": true, "jobId": "job_xyz", "statusUrl": "/api/pay/job/job_xyz" }
```

---

### GET `/api/pay/job/:jobId` — Job Status

```bash
curl http://localhost:3000/api/pay/job/job_xyz
```

---

### GET `/api/pay/:transactionId` — Get Transaction

```bash
curl http://localhost:3000/api/pay/txn_abc123
```

---

### GET `/api/pay/user/:userId` — User Transactions

```bash
curl "http://localhost:3000/api/pay/user/user_1?limit=10"
```

---

### GET `/api/metrics` — Full Metrics Snapshot

```bash
curl http://localhost:3000/api/metrics
```

---

### POST `/api/metrics/circuit/:gatewayName/reset` — Reset Circuit Breaker

```bash
curl -X POST http://localhost:3000/api/metrics/circuit/GATEWAY_A/reset
```

---

## 🔑 Key Concepts

### Idempotency
Send the same `Idempotency-Key` header twice — same response returned, zero duplicate transactions.

### Retry + Exponential Backoff
```
Attempt 1 → fail → wait 1s
Attempt 2 → fail → wait 2s
Attempt 3 → fail → mark FAILED
```

### Intelligent Routing
Gateway selected based on:
- Live success rate (from DB)
- Payment method preference
- Circuit breaker state

### Circuit Breaker States
```
CLOSED     → normal, requests pass through
OPEN       → gateway broken, requests blocked for 30s
HALF_OPEN  → testing recovery with limited requests
```

### Rate Limiting
Redis sliding window: 100 requests/minute per user.

---

## 🧪 Testing

```bash
# Load test (100 requests, 10 concurrent)
npm test

# Duplicate request test (idempotency)
KEY="test-$(date +%s)"
curl -X POST http://localhost:3000/api/pay \
  -H "Idempotency-Key: $KEY" \
  -H "Content-Type: application/json" \
  -d '{"userId":"u1","amount":100,"method":"UPI"}'

# Send same request again — should get identical response
curl -X POST http://localhost:3000/api/pay \
  -H "Idempotency-Key: $KEY" \
  -H "Content-Type: application/json" \
  -d '{"userId":"u1","amount":100,"method":"UPI"}'
```

---

## 📁 Project Structure

```
payment-gateway/
├── src/
│   ├── controllers/        # Request handlers
│   │   ├── paymentController.js
│   │   └── metricsController.js
│   ├── services/           # Business logic
│   │   ├── paymentService.js   ← retry logic here
│   │   └── metricsService.js
│   ├── gateways/           # Gateway simulations
│   │   ├── gatewayA.js     ← 80% success
│   │   ├── gatewayB.js     ← 65% success
│   │   ├── gatewayC.js     ← 50% success (fallback)
│   │   └── router.js       ← intelligent routing
│   ├── middleware/
│   │   ├── rateLimiter.js  ← Redis sliding window
│   │   ├── idempotency.js  ← duplicate prevention
│   │   ├── validator.js    ← input validation
│   │   └── errorHandler.js
│   ├── queue/
│   │   └── jobQueue.js     ← async payment queue
│   ├── utils/
│   │   ├── circuitBreaker.js ← CLOSED/OPEN/HALF_OPEN
│   │   └── logger.js
│   └── server.js
├── config/
│   ├── database.js         ← PostgreSQL pool
│   └── redis.js
├── dashboard/
│   └── index.html          ← real-time metrics UI
├── docker/
│   ├── Dockerfile
│   └── init.sql            ← DB schema + seed
├── tests/
│   └── load-test.js
├── docker-compose.yml
├── .env.example
└── package.json
```

---

## 💡 Resume Bullet

> Engineered a scalable payment gateway simulator in Node.js featuring idempotent APIs, exponential-backoff retry logic, intelligent multi-gateway routing, Redis-based sliding-window rate limiting, and circuit breaker pattern — with a real-time metrics dashboard and async job queue for high-throughput payment processing.
```
