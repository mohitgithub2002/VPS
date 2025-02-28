# Authentication API Documentation

## Table of Contents
- [Login](#login)
- [Forgot Password](#forgot-password)
- [Verify OTP](#verify-otp)
- [Reset Password](#reset-password)
- [Resend OTP](#resend-otp)

## Login

**Endpoint:** `POST /api/auth/login`

Authenticates a student using roll number and password.

### Request Body
```json
{
  "rollNumber": "string",
  "password": "string"
}
```

### Response
```json
{
  "status": "success",
  "message": "Login successful",
  "data": {
    "token": "string",
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
- `401` - Invalid credentials
- `500` - Internal server error

## Forgot Password

**Endpoint:** `POST /api/auth/forgot-password`

Initiates password reset by sending OTP to student's registered mobile number.

### Request Body
```json
{
  "rollNumber": "string"
}
```

### Response
```json
{
  "status": "success",
  "message": "OTP sent successfully",
  "data": {
    "maskedMobile": "string"
  }
}
```

### Error Responses
- `404` - Roll number not found
- `500` - Internal server error or OTP sending failure

## Verify OTP

**Endpoint:** `POST /api/auth/verify-otp`

Verifies OTP and generates reset token for password reset.

### Request Body
```json
{
  "rollNumber": "string",
  "otp": "string"
}
```

### Response
```json
{
  "status": "success",
  "message": "OTP verified successfully",
  "data": {
    "resetToken": "string"
  }
}
```

### Error Responses
- `400` - Invalid or expired OTP
- `500` - Internal server error

## Reset Password

**Endpoint:** `POST /api/auth/reset-password`

Resets student's password using valid reset token.

### Request Body
```json
{
  "rollNumber": "string",
  "resetToken": "string",
  "newPassword": "string"
}
```

### Response
```json
{
  "status": "success",
  "message": "Password reset successful"
}
```

### Error Responses
- `400` - Invalid or expired reset token
- `500` - Internal server error

## Resend OTP

**Endpoint:** `POST /api/auth/resend-otp`

Resends OTP to student's registered mobile number.

### Request Body
```json
{
  "rollNumber": "string"
}
```

### Response
```json
{
  "status": "success",
  "message": "OTP resent successfully",
  "data": {
    "maskedMobile": "string"
  }
}
```

### Error Responses
- `404` - Roll number not found
- `500` - Internal server error or OTP sending failure

## Features

- JWT-based authentication
- Secure password hashing using bcrypt
- OTP-based password reset flow
- WhatsApp OTP delivery
- Mobile number masking for privacy
- Token-based password reset
- Automatic cleanup of expired OTPs and reset tokens
- Rate limiting (recommended to be implemented at the infrastructure level)
- MongoDB for OTP and reset token storage
- Supabase for student data storage
