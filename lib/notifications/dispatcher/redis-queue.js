// lib/notifications/dispatcher/redis-queue.js
// Placeholder for future Redis/BullMQ implementation.
// Throws so developers know queue driver is not yet ready.

export default class RedisQueueDispatcher {
  async send(/* notificationRows */) {
    throw new Error('RedisQueueDispatcher not implemented. Set NOTIFICATION_DRIVER=sync');
  }
} 