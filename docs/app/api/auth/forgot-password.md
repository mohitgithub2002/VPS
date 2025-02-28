# Forgot Password API

## Overview
Initiates the password reset process by sending an OTP to the student's registered mobile number.

## Endpoint
```
POST /api/auth/forgot-password
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
  "message": "OTP sent successfully",
  "data": {
    "maskedMobile": "****1234"
  }
}
```

### Error Responses

#### Roll Number Not Found (404 Not Found)
```json
{
  "status": "error",
  "message": "Roll number not found"
}
```

#### OTP Sending Failed (500 Internal Server Error)
```json
{
  "status": "error",
  "message": "Failed to send OTP"
}
```

## Security Considerations
- Stores hashed OTP only
- Limited OTP validity (10 minutes)
- Returns masked mobile number
- WhatsApp integration for secure delivery
