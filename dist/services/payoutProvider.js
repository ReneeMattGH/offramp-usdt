export class PayoutProvider {
    async initiatePayout(order, user, bank) {
        console.log(`[PAYOUT_PROVIDER] Manual payout required for order ${order.id}`);
        // In manual mode, we just return PROCESSING and wait for admin to mark as COMPLETED
        return {
            status: 'PROCESSING',
            reason: 'Manual payout required',
            payout_id: `MANUAL_${order.id}`,
            raw: { mode: 'MANUAL' }
        };
    }
}
//# sourceMappingURL=payoutProvider.js.map