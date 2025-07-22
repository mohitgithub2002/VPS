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

  let effectiveRecipients = recipients;

  if (broadcastToStudents) {
    // Fetch distinct student ids that have at least one valid token
    const { data: tokensData, error: tokErr } = await supabase
      .from('device_tokens')
      .select('student_id')
      .not('student_id', 'is', null)
      .eq('is_valid', true);

    if (tokErr) throw tokErr;

    const ids = Array.from(new Set(tokensData.map(t => t.student_id)));
    effectiveRecipients = ids.map(id => ({ role: 'student', id }));
  }

  // Fetch template if exists & active
  let template;
  if (type) {
    const { data: templates } = await supabase.from('notification_templates').select('*').eq('type', type).eq('is_active', true).limit(1);
    template = templates?.[0];
  }

  // Build rows to insert
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