# Supabase Client Configuration

This documentation covers the setup and configuration of the Supabase client used in the school management system.

## Overview

The `supabaseClient.js` file handles the initialization and configuration of our Supabase database connection. It provides a centralized client instance that can be used throughout the application.

## Configuration

### Environment Variables

The client requires two essential environment variables:

- `SUPABASE_URL`: The URL of your Supabase project
- `SUPABASE_SERVICE_ROLE_KEY`: Service role key for authenticated access

These must be set in your `.env` file:

```env
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

## Implementation

Here's how the Supabase client is implemented:

```javascript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey);
```

## Usage

To use the Supabase client in other parts of the application, import it like this:

```javascript
import { supabase } from '../utils/supabaseClient';

// Example query
const { data, error } = await supabase
  .from('table_name')
  .select('*');
```

## Best Practices

1. Always use the exported `supabase` instance instead of creating new clients
2. Handle potential connection errors in your application
3. Keep the environment variables secure and never commit them to version control

## Related Documentation

- [Supabase Official Documentation](https://supabase.com/docs)
- [Supabase JavaScript Client](https://supabase.com/docs/reference/javascript/introduction)
