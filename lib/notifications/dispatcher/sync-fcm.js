// lib/notifications/dispatcher/sync-fcm.js
import { supabase } from '@/utils/supabaseClient';
import chunkTokens from '../utils/chunkTokens.js';
import pLimit from 'p-limit';
import admin from 'firebase-admin';

// Lazy Firebase initialization
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FCM_SERVICE_ACCOUNT_JSON || '{}');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const MESSAGING = admin.messaging();
const MAX_PARALLEL_SENDS = parseInt(process.env.DISPATCH_CONCURRENCY || '3', 10);
const CHUNK_SIZE = parseInt(process.env.DISPATCH_CHUNK_SIZE || '500', 10);
const limit = pLimit(MAX_PARALLEL_SENDS);

export default class SyncFcmDispatcher {
  /**
   * Sends an array of notification rows (already persisted) via FCM
   * and updates their status in DB.
   * @param {Array<{notification_id:number, recipient_id:string, title:string, body:string, data_json:any}>} notificationRows
   */
  async sendToTopic(topicType, notificationRow) {
    let safeData;
    if (notificationRow.data_json) {
      safeData = {};
      Object.entries(notificationRow.data_json).forEach(([k, v]) => {
        if (v !== undefined && v !== null) safeData[k] = String(v);
      });
    }

    if (topicType === 'all') {
      // Send to multiple topics
      const topics = ['students', 'teachers', 'admins'];
      await Promise.all(topics.map(async (topic) => {
        const message = {
          topic,
          notification: {
            title: notificationRow.title,
            body: notificationRow.body
          },
          data: safeData
        };
        await MESSAGING.send(message);
      }));
    } else {
      const message = {
        topic: topicType, // 'students', 'teachers', 'admins'
        notification: {
          title: notificationRow.title,
          body: notificationRow.body
        },
        data: safeData
      };
      await MESSAGING.send(message);
    }

    // Mark as sent
    await this.markSent(notificationRow.notification_id);
    console.log(`Sent topic message to ${topicType}`);
  }

  async send(notificationRows) {
    // Build unique recipient list
    const uniqueKeys = [...new Set(notificationRows.map(n => `${n.recipient_type}-${n.recipient_id}`))];

    // Fetch tokens for all recipients in parallel
    const tokenMap = new Map();
    await Promise.all(uniqueKeys.map(async (key) => {
      const [role,id] = key.split('-');
      const { data, error } = await supabase
        .from('device_tokens')
        .select('token')
        .eq('recipient_type', role)
        .eq('recipient_id', id)
        .eq('is_valid', true);
      if (!error && data?.length) {
        tokenMap.set(key, data.map(t => t.token));
      }
    }));
    

    // Iterate notifications sequentially (could batch by user but keep simple)
    for (const n of notificationRows) {
      const key = `${n.recipient_type}-${n.recipient_id}`;
      const tokens = tokenMap.get(key) || [];
      if (tokens.length === 0) {
        await this.markFailed(n.notification_id, 'no_tokens', 'No valid device tokens');
        continue;
      }

      const tasks = chunkTokens(tokens, CHUNK_SIZE).map((tokenChunk) => limit(() => this._sendChunk(n, tokenChunk)));
      // Wait for all chunks
      const results = await Promise.all(tasks);
      const anySuccess = results.some(r => r.successCount > 0);

      if (anySuccess) {
        await this.markSent(n.notification_id);
      } else {
        // capture first error code if available
        const firstResp = results[0]?.responses?.find(r => !r.success);
        const errCode = firstResp?.error?.code || 'all_failed';
        const errMsg = firstResp?.error?.message || 'All tokens failed';
        await this.markFailed(n.notification_id, errCode, errMsg);
      }
    }
  }

  async _sendChunk(notificationRow, tokenChunk) {
    // FCM requires data values to be strings.
    let safeData;
    if (notificationRow.data_json) {
      safeData = {};
      Object.entries(notificationRow.data_json).forEach(([k, v]) => {
        if (v !== undefined && v !== null) safeData[k] = String(v);
      });
    }

    const req = {
      tokens: tokenChunk,
      notification: {
        title: notificationRow.title,
        body: notificationRow.body
      },
      data: safeData
    };

    try {
      // Use HTTP v1 per-message call under the hood (avoids legacy /batch)
      const response = await MESSAGING.sendEachForMulticast(req, false);
      // Clean invalid tokens
      await this._handleSendResponse(tokenChunk, response);
      return response;
    } catch (err) {
      console.error('FCM send error', err);
      return { successCount: 0 };
    }
  }

  async _handleSendResponse(tokens, response) {
    const invalidTokens = [];
    response.responses.forEach((res, idx) => {
      if (!res.success) {
        const errorCode = res.error?.code || '';
        if (errorCode === 'messaging/invalid-registration-token' || errorCode === 'messaging/registration-token-not-registered') {
          invalidTokens.push(tokens[idx]);
        }
      }
    });
    if (invalidTokens.length) {
      // Mark tokens invalid in DB
      await supabase.from('device_tokens').update({ is_valid: false }).in('token', invalidTokens);
    }
  }

  async markSent(notificationId) {
    await supabase.from('notifications').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('notification_id', notificationId);
  }

  async markFailed(notificationId, errorCode, errorMsg) {
    await supabase.from('notifications').update({ status: 'failed' }).eq('notification_id', notificationId);
    await supabase.from('send_failures').insert({ notification_id: notificationId, error_code: errorCode, error_msg: errorMsg });
  }
} 