// lib/notifications/dispatcher/dispatcher.js
// Dispatcher factory responsible for returning the correct implementation
// based on the NOTIFICATION_DRIVER env variable.

import SyncFcmDispatcher from './sync-fcm.js';
import RedisQueueDispatcher from './redis-queue.js';

export default function getDispatcher() {
  const driver = (process.env.NOTIFICATION_DRIVER || 'sync').toLowerCase();
  switch (driver) {
    case 'queue':
      return new RedisQueueDispatcher();
    case 'sync':
    default:
      return new SyncFcmDispatcher();
  }
} 