# Student Login API

## Overview
Authenticates students using their roll number and password, providing a JWT token upon successful authentication.

## Endpoint
```
POST /api/auth/login
```

## Request
### Headers
- `Content-Type: application/json`

### Body
```json
{
  "rollNumber": "string",
  "password": "string"
}
```

### Parameters
| Parameter   | Type   | Required | Description         |
|------------|--------|----------|---------------------|
| rollNumber | string | Yes      | Student roll number |
| password   | string | Yes      | Student password    |

## Response

### Success Response (200 OK)
```json
{
  "status": "success",
  "message": "Login successful",
  "data": {
    "token": "jwt_token_string",
    "user": {
      "id": "string",
      "rollNumber": "string",
      "name": "string",
      "class": "string",
      "section": "string",
      "role": "string"
    }
  }
}
```

### Error Responses

#### Invalid Credentials (401 Unauthorized)
```json
{
  "status": "error",
  "message": "Invalid roll number or password"
}
```

#### Server Error (500 Internal Server Error)
```json
{
  "status": "error",
  "message": "Internal server error"
}
```

## Implementation Details
- Uses Supabase for student data storage
- Passwords are hashed using bcrypt
- Authentication token is generated using JWT
- Token includes studentId, rollNumber, and name
