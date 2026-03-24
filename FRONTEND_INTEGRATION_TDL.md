# Frontend Integration To-Do List (TDL)

This document summarizes the backend changes and integration requirements for the frontend developer.

### **Backend Refactor & Integration Status**

| Category | Task | Status | Description |
| :--- | :--- | :--- | :--- |
| **Authentication** | Auth Endpoint Verification | ✅ Completed | `/api/auth/` routes (login, signup, OTP) are verified and functional. |
| **Payout System** | Razorpay Removal | ✅ Completed | All Razorpay SDKs and API calls removed. System now uses `PayoutProvider` for manual processing. |
| **Payout System** | Manual Workflow | ✅ Completed | Approved orders now move to `PROCESSING` status. Admin must manually complete and update status via `/api/admin/orders/:id/status`. |
| **Real-time Data** | Balance Stream (SSE) | ✅ Completed | New endpoint: `GET /api/stream/balance`. Frontend should use `EventSource` to listen for live balance updates. |
| **Real-time Data** | Orders Stream (SSE) | ✅ Completed | New endpoint: `GET /api/stream/orders`. Frontend should use `EventSource` to listen for live exchange order status updates. |
| **Config** | Env Var Cleanup | ✅ Completed | Removed `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, etc. `ENABLE_REAL_PAYOUTS` set to `false`. |
| **Infrastructure** | Build Optimization | ✅ Completed | Root `package.json` updated to build from `server/` directory. Optimized for Render/Vercel deployment. |
| **Infrastructure** | Static Hosting | ✅ Completed | Backend now serves files from `/public` directory automatically. |
| **Frontend Task** | Webhook Cleanup | ⏳ Pending | **Action Required:** Remove any client-side logic that expects a Razorpay checkout popup or success callback. |
| **Frontend Task** | SSE Implementation | ⏳ Pending | **Action Required:** Replace polling logic for balance/orders with the new SSE stream endpoints for better performance. |

---

### **Integration Notes for Frontend Developer**

1. **Manual Payout Workflow**:
   - The frontend should no longer trigger any Razorpay UI or checkout scripts.
   - When a user creates an exchange order, the backend will lock the USDT and set the order to a pending state.
   - Inform users that payouts are processed manually by administrators.

2. **Real-time Updates (SSE)**:
   - **Balance Updates**:
     ```javascript
     const balanceSource = new EventSource('/api/stream/balance');
     balanceSource.addEventListener('balance', (event) => {
       const balance = JSON.parse(event.data);
       // Update UI with balance.available_balance
     });
     ```
   - **Order Updates**:
     ```javascript
     const orderSource = new EventSource('/api/stream/orders');
     orderSource.addEventListener('orders', (event) => {
       const orders = JSON.parse(event.data);
       // Refresh order list or specific order status
     });
     ```

3. **Deployment Info**:
   - The project is configured for Render.
   - **Build Command**: `npm run build`
   - **Start Command**: `npm start`
   - All logic is consolidated in the `server/` directory but managed from the root for deployment convenience.
