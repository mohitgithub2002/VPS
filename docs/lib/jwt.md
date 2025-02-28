# JWT Utilities

## Overview
JWT (JSON Web Token) utility functions for token generation and verification.

## Functions

### signJWT(payload, expiresIn)
Generates a signed JWT token.

#### Parameters
| Parameter | Type   | Required | Default | Description              |
|-----------|--------|----------|---------|--------------------------|
| payload   | Object | Yes      | -       | Data to encode in token |
| expiresIn | string | No       | '7d'    | Token expiration time   |

#### Example
```javascript
const token = signJWT({
  studentId: '123',
  rollNumber: 'R001'
});
```

### verifyJWT(token)
Verifies and decodes a JWT token.

#### Parameters
| Parameter | Type   | Required | Description     |
|-----------|--------|----------|-----------------|
| token     | string | Yes      | JWT to verify   |

#### Returns
- Decoded token payload if valid
- Throws error if invalid or expired

## Configuration
- Uses `JWT_SECRET` from environment variables
- Default token expiration: 7 days
