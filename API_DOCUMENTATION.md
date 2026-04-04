# API Documentation

This document outlines the Authentication, KYC, and Wallet modules for the platform.

---

## 🔐 Authentication APIs
**Base URL:** `http://localhost:3005/api/auth`

### 1. Google Authentication
**Endpoint:** `POST /google`

**Description:**
Authenticates or registers a user via a Google OAuth2 `id_token`. If the user is new, their account is created automatically with `email_verified: true`.

**Request Body:**
```json
{
  "id_token": "eyJhbGciOiJ..."
}
```

**Success Response (200 OK):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1Ni...",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "account_holder_name": "John Doe",
    "email_verified": true,
    "auth_provider": "google",
    "kyc_status": "not_submitted"
  }
}
```

---

### 2. Passwordless Unified Entry (Signup/Login)
**Endpoint:** `POST /send-email-otp`

**Description:**
Sends a 6-digit numeric verification code to the provided email. Works for both new users and existing logins.

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Success Response (200 OK):**
```json
{
  "success": true, 
  "message": "A 6-digit verification code has been sent to your email."
}
```

---

### 3. Verify Email OTP
**Endpoint:** `POST /verify-email-otp`

**Description:**
Verifies the 6-digit code. On success, returns valid session JWT and user profile metadata.

---

## 🆔 KYC (Identity Verification)
**Base URL:** `http://localhost:3005/api/kyc`

### 1. Submit KYC & Set Phone Number
**Endpoint:** `POST /verify-kyc`
**Header:** `Authorization: Bearer <token>`
**Content-Type:** `multipart/form-data`

**Description:**
Submits identity documents and sets the user's primary mobile number.

**Form Data Fields:**
- `full_name`: (String) Full name as per Aadhaar.
- `phone_number`: (String) **MANDATORY.** Stores user's phone in profile.
- `dob`: (String) Date of birth (DD-MM-YYYY).
- `aadhaar_number`: (String) 12-digit Aadhaar number.
- `aadhaar_image`: (File) JPG/PNG of Aadhaar card.

---

### 2. Get KYC Status
**Endpoint:** `GET /status`

---

### 3. Start Over / Reset KYC
**Endpoint:** `POST /reset`

---

## 💰 Wallet APIs
**Base URL:** `http://localhost:3005/api/wallet`

### 1. Get Wallet Balance
**Endpoint:** `GET /balance`
**Header:** `Authorization: Bearer <token>`

**Description:**
Retrieves the user's current available and locked USDT balance.

**Success Response (200 OK):**
```json
{
  "available_balance": 100.50,
  "locked_balance": 0.00,
  "is_consistent": true
}
```

---

### 2. Generate Deposit Address
**Endpoint:** `POST /generate-address`
**Header:** `Authorization: Bearer <token>`

**Description:**
Generates a unique TRON (USDT) deposit address for the user, valid for 30 minutes.

**Success Response (200 OK):**
```json
{
  "userId": "uuid",
  "tronAddress": "T...",
  "expiresAt": "timestamp"
}
```
