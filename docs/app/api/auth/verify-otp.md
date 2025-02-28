# Verify OTP API

## Overview
Verifies the OTP provided by the student and generates a reset token for password reset.

## Endpoint
```
POST /api/auth/verify-otp
```

## Request
### Headers
- `Content-Type: application/json`

### Body
```json
{
  "rollNumber": "string",
  "otp": "string"
}
```

### Parameters
| Parameter   | Type   | Required | Description             |
|------------|--------|----------|-------------------------|
| rollNumber | string | Yes      | Student roll number     |
| otp        | string | Yes      | 6-digit OTP received    |

## Response

### Success Response (200 OK)
```json
{
  "status": "success",
  "message": "OTP verified successfully",
  "data": {
    "resetToken": "32_byte_hex_string"
  }
}
```

### Error Responses

#### Invalid OTP (400 Bad Request)
```json
{
  "status": "error",
  "message": "Invalid or expired OTP"
}
```

## Security Features
- OTP comparison using bcrypt
- Auto-deletion of used OTPs
- 30-minute reset token validity
- Cryptographically secure token generation
