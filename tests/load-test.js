/**
 * LOAD TEST — simulates 100 concurrent payment requests
 * Run: node tests/load-test.js
 */

const BASE_URL = 'http://localhost:3000';
const TOTAL_REQUESTS = 100;
const CONCURRENT = 10;
const METHODS = ['UPI', 'CARD', 'NETBANKING', 'WALLET'];

const results = { success: 0, failed: 0, errors: 0, totalMs: 0 };

const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const makePayment = async (i) => {
  const start = Date.now();
  const idempotencyKey = `load_test_${i}_${Date.now()}`;

  try {
    const res = await fetch(`${BASE_URL}/api/pay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({
        userId: `load_user_${randomInt(1, 20)}`,
        amount: randomInt(100, 50000),
        method: METHODS[Math.floor(Math.random() * METHODS.length)],
      }),
    });

    const data = await res.json();
    const elapsed = Date.now() - start;
    results.totalMs += elapsed;

    if (data.success) {
      results.success++;
      process.stdout.write('✓');
    } else {
      results.failed++;
      process.stdout.write('✗');
    }
  } catch (err) {
    results.errors++;
    process.stdout.write('E');
  }
};

const runBatch = async (batchStart) => {
  const promises = [];
  for (let i = batchStart; i < Math.min(batchStart + CONCURRENT, TOTAL_REQUESTS); i++) {
    promises.push(makePayment(i));
  }
  await Promise.all(promises);
};

const run = async () => {
  console.log(`\n🚀 Load Test — ${TOTAL_REQUESTS} requests (${CONCURRENT} concurrent)\n`);
  const start = Date.now();

  for (let i = 0; i < TOTAL_REQUESTS; i += CONCURRENT) {
    await runBatch(i);
  }

  const totalTime = Date.now() - start;
  const avg = results.totalMs / (results.success + results.failed || 1);

  console.log(`\n\n📊 Results:`);
  console.log(`  Total:   ${TOTAL_REQUESTS}`);
  console.log(`  Success: ${results.success} (${((results.success / TOTAL_REQUESTS) * 100).toFixed(1)}%)`);
  console.log(`  Failed:  ${results.failed}`);
  console.log(`  Errors:  ${results.errors}`);
  console.log(`  Avg RT:  ${avg.toFixed(0)}ms`);
  console.log(`  Total:   ${totalTime}ms`);
  console.log(`  RPS:     ${(TOTAL_REQUESTS / (totalTime / 1000)).toFixed(1)}`);
};

run().catch(console.error);
