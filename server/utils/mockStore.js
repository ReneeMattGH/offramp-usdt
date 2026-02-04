
const kycStatusStore = {}; // userId -> status
const usdtWithdrawalsStore = []; // Array of withdrawal objects
const ledgerStore = {}; // userId -> { available_balance, locked_balance, settled_balance }
const sessionStore = {}; // token -> { user_id, expires_at }

module.exports = { kycStatusStore, usdtWithdrawalsStore, ledgerStore, sessionStore };
