
const kycStatusStore = {}; // userId -> status
const usdtWithdrawalsStore = []; // Array of withdrawal objects
const ledgerStore = {}; // userId -> { available_balance, locked_balance, settled_balance }

module.exports = { kycStatusStore, usdtWithdrawalsStore, ledgerStore };
