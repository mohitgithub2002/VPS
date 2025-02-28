# OTP Model

## Overview
Mongoose schema for managing One-Time Passwords (OTPs) in the system.

## Schema Definition

### Fields
| Field      | Type    | Required | Index | Description                    |
|------------|---------|----------|-------|--------------------------------|
| studentId  | String  | Yes      | Yes   | Student ID reference          |
| rollNumber | String  | Yes      | No    | Student's roll number         |
| otp        | String  | Yes      | No    | Hashed OTP value             |
| purpose    | String  | Yes      | No    | OTP purpose (password_reset)  |
| expiresAt  | Date    | Yes      | No    | OTP expiration timestamp      |
| isUsed     | Boolean | No       | No    | OTP usage status             |

## Timestamps
- `createdAt`: Automatic timestamp of OTP creation
- `updatedAt`: Automatic timestamp of last update

## Indexes
- `studentId`: For efficient lookups by student

## Example Usage
```javascript
const otpRecord = await Otp.create({
  studentId: '123',
  rollNumber: 'R001',
  otp: hashedOtp,
  purpose: 'password_reset',
  expiresAt: new Date(Date.now() + 10 * 60 * 1000)
});
```
