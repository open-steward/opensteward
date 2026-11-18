/**
 * WEBHOOK_REFRESH_MAP — canonical webhook resourceType slug → adapter
 * single-resource `get` method. Used by the inbound webhook consumer to
 * refresh exactly the affected resource in the data-store cache. Slugs match
 * the payments `WebhookResourceType` enum; only resources with a single-fetch
 * `get` method are listed (others fall through and are skipped).
 */
export const WEBHOOK_REFRESH_MAP: Record<string, string> = {
  charges: 'getCharge',
  refunds: 'getRefund',
  customers: 'getCustomer',
  payment_methods: 'getPaymentMethod',
  subscriptions: 'getSubscription',
  invoices: 'getInvoice',
  payouts: 'getPayout',
  disputes: 'getDispute',
  plans: 'getPlan',
  prices: 'getPrice',
  products: 'getProduct',
  balance_transactions: 'getBalanceTransaction',
}
