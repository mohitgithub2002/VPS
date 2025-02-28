# Resend OTP API

## Overview
Allows requesting a new OTP if the previous one expired or wasn't received.

## Endpoint
```
POST /api/auth/resend-otp
```

## Request
### Headers
- `Content-Type: application/json`

### Body
```json
{
  "rollNumber": "string"
}
```

### Parameters
| Parameter   | Type   | Required | Description         |
|------------|--------|----------|---------------------|
| rollNumber | string | Yes      | Student roll number |

## Response

### Success Response (200 OK)
```json
{
  "status": "success",
  "message": "OTP resent successfully",
  "data": {
    "maskedMobile": "****1234"
  }
}
```

### Error Responses

#### Not Found (404 Not Found)
```json
{
  "status": "error",
  "message": "Roll number not found"
}
```

## Implementation Details
- Cleans up existing unused OTPs
- Generates new 6-digit OTP
- 10-minute validity period
- WhatsApp delivery with retry
