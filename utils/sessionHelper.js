/**
 * @module utils/sessionHelper
 * @fileoverview Centralized session resolution utility
 * 
 * ALL APIs should use these functions instead of inline session queries.
 * This ensures consistent behavior across the entire application.
 */

import { supabase } from "@/utils/supabaseClient";

/**
 * Get the currently active session.
 * 
 * Resolution order:
 * 1. Query for the session where is_active = true
 * 2. Fallback: ORDER BY start_date DESC LIMIT 1 (backward compat)
 * 
 * @returns {Promise<{session_id: number, session_name: string, start_date: string, end_date: string, is_active: boolean} | null>}
 */
export async function getActiveSession() {
  // Primary: find the session marked as active
  const { data: activeSession, error: activeError } = await supabase
    .from('sessions')
    .select('session_id, session_name, start_date, end_date, is_active')
    .eq('is_active', true)
    .maybeSingle();

  if (!activeError && activeSession) {
    return activeSession;
  }

  // Fallback: latest session by start_date
  const { data: latestSession, error: latestError } = await supabase
    .from('sessions')
    .select('session_id, session_name, start_date, end_date, is_active')
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestError) {
    console.error('Failed to resolve active session:', latestError);
    return null;
  }

  return latestSession;
}

/**
 * Get session by ID with validation.
 * 
 * @param {number} sessionId
 * @returns {Promise<{session_id: number, session_name: string, start_date: string, end_date: string, is_active: boolean} | null>}
 */
export async function getSessionById(sessionId) {
  if (!sessionId) return null;

  const { data, error } = await supabase
    .from('sessions')
    .select('session_id, session_name, start_date, end_date, is_active')
    .eq('session_id', sessionId)
    .maybeSingle();

  if (error) {
    console.error('Failed to fetch session by ID:', error);
    return null;
  }

  return data;
}

/**
 * Resolve a session ID from a request parameter.
 * 
 * - If sessionId is provided and valid, returns it
 * - If sessionId is not provided, returns the active session's ID
 * - Returns null if no session could be resolved
 * 
 * @param {string|number|null} requestedSessionId - The session_id from the request query params
 * @returns {Promise<{sessionId: number, session: object} | {sessionId: null, session: null}>}
 */
export async function resolveSessionId(requestedSessionId) {
  if (requestedSessionId) {
    const session = await getSessionById(parseInt(requestedSessionId, 10));
    if (session) {
      return { sessionId: session.session_id, session };
    }
    // Requested session doesn't exist — don't fallback, return null
    return { sessionId: null, session: null };
  }

  // No session requested — use active session
  const activeSession = await getActiveSession();
  if (activeSession) {
    return { sessionId: activeSession.session_id, session: activeSession };
  }

  return { sessionId: null, session: null };
}

/**
 * Get the active session ID only (convenience shorthand).
 * 
 * @returns {Promise<number|null>}
 */
export async function getActiveSessionId() {
  const session = await getActiveSession();
  return session?.session_id || null;
}

/**
 * Get all sessions ordered by start_date descending.
 * 
 * @returns {Promise<Array>}
 */
export async function getAllSessions() {
  const { data, error } = await supabase
    .from('sessions')
    .select('session_id, session_name, start_date, end_date, is_active, created_at')
    .order('start_date', { ascending: false });

  if (error) {
    console.error('Failed to fetch all sessions:', error);
    return [];
  }

  return data || [];
}
