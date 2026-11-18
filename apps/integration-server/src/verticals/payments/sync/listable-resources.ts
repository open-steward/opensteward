/**
 * LISTABLE_RESOURCES — the (resourceType, adapter method) pairs the background
 * sync worker iterates over when fulfilling a sync job.
 */
export const LISTABLE_RESOURCES: Array<{ resourceType: string; method: string }> = [
  { resourceType: 'customers', method: 'listCustomers' },
  { resourceType: 'payment_methods', method: 'listPaymentMethods' },
  { resourceType: 'charges', method: 'listCharges' },
  { resourceType: 'refunds', method: 'listRefunds' },
  { resourceType: 'subscriptions', method: 'listSubscriptions' },
  { resourceType: 'invoices', method: 'listInvoices' },
  { resourceType: 'payouts', method: 'listPayouts' },
  { resourceType: 'disputes', method: 'listDisputes' },
  { resourceType: 'plans', method: 'listPlans' },
  { resourceType: 'prices', method: 'listPrices' },
  { resourceType: 'products', method: 'listProducts' },
  { resourceType: 'balance_transactions', method: 'listBalanceTransactions' },
]
