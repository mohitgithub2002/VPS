# Reset Token Model

## Overview
Mongoose schema for managing password reset tokens.

## Schema Definition

### Fields
| Field      | Type    | Required | Index | Unique | Description                   |
|------------|---------|----------|-------|--------|-------------------------------|
| studentId  | String  | Yes      | Yes   | No     | Student ID reference         |
| token      | String  | Yes      | No    | Yes    | Unique reset token          |
| expiresAt  | Date    | Yes      | No    | No     | Token expiration timestamp   |
| isUsed     | Boolean | No       | No    | No     | Token usage status          |

## Timestamps
- `createdAt`: Automatic timestamp of token creation
- `updatedAt`: Automatic timestamp of last update

## Indexes
- `studentId`: For efficient lookups
- `token`: Unique index for token validation

## Example Usage
```javascript
const resetToken = await ResetToken.create({
  studentId: '123',
  token: 'generated_token',
  expiresAt: new Date(Date.now() + 30 * 60 * 1000)
});
```
