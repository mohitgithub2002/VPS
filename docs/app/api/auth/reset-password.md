# Reset Password API

## Overview
Allows students to reset their password using a valid reset token.

## Endpoint
```
POST /api/auth/reset-password
```

## Request
### Headers
- `Content-Type: application/json`

### Body
```json
{
  "rollNumber": "string",
  "resetToken": "string",
  "newPassword": "string"
}
```

### Parameters
| Parameter   | Type   | Required | Description                    |
|------------|--------|----------|--------------------------------|
| rollNumber | string | Yes      | Student roll number            |
| resetToken | string | Yes      | Token from verify-otp endpoint |
| newPassword| string | Yes      | New password to set            |

## Response

### Success Response (200 OK)
```json
{
  "status": "success",
  "message": "Password reset successful"
}
```

### Error Responses

#### Invalid Token (400 Bad Request)
```json
{
  "status": "error",
  "message": "Invalid or expired reset token"
}
```

## Security Features
- Password hashing with bcrypt
- One-time use reset tokens
- Auto-deletion of used tokens
- Token expiration check
