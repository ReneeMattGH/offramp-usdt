# Frontend Integration & Cleanup TDL

### 1. Razorpay Removal (Critical)
- [ ] Remove Razorpay checkout scripts from `index.html`.
- [ ] Delete all frontend logic related to triggering payment popups.
- [ ] Remove webhook-dependent success/failure handlers.

### 2. Manual Payout Flow
- [ ] Update order creation UI to remove payment gateway step.
- [ ] Display "Processing - Pending Admin Approval" for all new exchange orders.
- [ ] Show INR payout details in the order summary without the "Pay" button.

### 3. SSE Integration (Real-time)
- [ ] Implement `EventSource` for balance updates:
  - Endpoint: `GET /api/stream/balance`
  - Event: `balance`
- [ ] Implement `EventSource` for order updates:
  - Endpoint: `GET /api/stream/orders`
  - Event: `orders`
- [ ] Remove legacy polling logic (intervals) for balance/order refreshes.

### 4. Deployment Check
- [ ] Verify that all frontend assets are being built into the `public/` directory for backend serving.
- [ ] Ensure local `.env` doesn't contain any legacy RAZORPAY keys that could cause confusion.
