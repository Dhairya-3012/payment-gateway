const { createClient } = require('redis');

const client = createClient({
  socket: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    reconnectStrategy: (retries) => {
      if (retries > 10) return new Error('Redis reconnect failed');
      return Math.min(retries * 100, 3000); // exponential backoff
    },
  },
});

client.on('error', (err) => console.error('❌ Redis error:', err));
client.on('connect', () => console.log('✅ Redis connected'));
client.on('reconnecting', () => console.log('🔄 Redis reconnecting...'));

// Connect immediately
(async () => {
  await client.connect();
})();

module.exports = client;
