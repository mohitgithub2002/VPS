/**
 * @module utils/supabaseClient
 * @fileoverview Supabase client configuration and initialization
 * This file sets up the connection to the Supabase backend service
 */

import { createClient } from '@supabase/supabase-js';

/**
 * Environment variables for Supabase configuration
 * SUPABASE_URL: The URL of your Supabase project
 * SUPABASE_SERVICE_ROLE_KEY: Service role key for authenticated access
 * 
 * @important These environment variables must be properly set in .env file
 * @see https://supabase.com/docs/reference/javascript/initializing
 */
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Initialize Supabase client with project credentials
 * This instance will be used throughout the application for database operations
 * 
 * @constant {SupabaseClient}
 */
export const supabase = createClient(supabaseUrl, supabaseKey);

// Log successful database connection
console.log("Database connected successfully");
