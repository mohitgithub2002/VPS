// lib/notifications/index.js
import getDispatcher from './dispatcher/dispatcher.js';
import { supabase } from '@/utils/supabaseClient';

const dispatcher = getDispatcher();

/**
 * Inserts notifications rows and optionally dispatches them immediately.
 *
 * @param {Object} params
 * @param {string} params.type - Template type e.g. 'announcement'
 * @param {string} params.title - Fallback title if template not found
 * @param {string} params.body - Fallback body
 * @param {Array<{role:'student'|'teacher'|'admin', id:number|string}>} params.recipients
 * @param {Object} params.data - Extra JSON payload
 */
export async function createAndSend({ type, title, body, recipients, data }) {
  // Handle broadcast to all students
  const broadcastToStudents = recipients?.some(r => r.role === 'student' && (r.id === 'ALL' || r.id === 'BROADCAST' || r.id === '*'));
  const broadcastToTeachers = recipients?.some(r => r.role === 'teacher' && (r.id === 'ALL' || r.id === 'BROADCAST' || r.id === '*'));
  const broadcastToAll = recipients?.some(r => r.role === 'all' && (r.id === 'ALL' || r.id === 'BROADCAST' || r.id === '*'));

  let effectiveRecipients = recipients;

  let isBroadcast = false;
  let broadcastType = null;

  if (broadcastToStudents) {
    isBroadcast = true;
    broadcastType = 'students';
    effectiveRecipients = [{ role: 'student', id: 'TOPIC' }];
  } else if (broadcastToTeachers) {
    isBroadcast = true;
    broadcastType = 'teachers';
    effectiveRecipients = [{ role: 'teacher', id: 'TOPIC' }];
  } else if (broadcastToAll) {
    isBroadcast = true;
    broadcastType = 'all';
    effectiveRecipients = [
      { role: 'student', id: 'TOPIC' },
      { role: 'teacher', id: 'TOPIC' },
      { role: 'admin', id: 'TOPIC' }
    ];
  }

  console.log(effectiveRecipients);

  // Fetch template if exists & active
  let template;
  if (type) {
    const { data: templates } = await supabase.from('notification_templates').select('*').eq('type', type).eq('is_active', true).limit(1);
    template = templates?.[0];
  }

  if (isBroadcast) {
    // For broadcasts, create single notification record and send via topic
    const notificationData = {
      notification_template_id: template?.notification_template_id || null,
      title: template ? template.title_template : title,
      body: template ? template.body_template : body,
      data_json: data || null,
      dispatch_mode: process.env.NOTIFICATION_DRIVER || 'sync',
      recipient_id: 'ALL',
      recipient_type: broadcastType
    };

    // Insert single record for audit
    const { data: insertedRows, error } = await supabase.from('notifications').insert([notificationData]).select('*');
    if (error) throw error;

    // Send via topic
    await dispatcher.sendToTopic(broadcastType, insertedRows[0]);
    return 1;
  } else {
    // Individual sends
    const rows = effectiveRecipients.map((r) => {
      const base = {
        notification_template_id: template?.notification_template_id || null,
        title: template ? template.title_template : title,
        body: template ? template.body_template : body,
        data_json: data || null,
        dispatch_mode: process.env.NOTIFICATION_DRIVER || 'sync',
        recipient_id: String(r.id),
        recipient_type: r.role
      };
      return base;
    });

    const { data: insertedRows, error } = await supabase.from('notifications').insert(rows).select('*');
    if (error) throw error;

    // Dispatch using selected driver
    await dispatcher.send(insertedRows);
    return insertedRows.length;
  }
} 