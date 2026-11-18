export const metadata = {
  platform: 'hyperpay',
  totalResources: 10,
  availableResources: ['charge', 'refund', 'payment-method'],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason:
        'HyperPay/OPPWA has no balance or ledger transaction API; settlement data is accessible via merchant portal reports only, not a REST endpoint',
    },
    {
      resource: 'customer',
      reason:
        'No customer object endpoint; customer data (email, name) is embedded as fields on payment request/response objects only',
    },
    {
      resource: 'dispute',
      reason:
        'Chargeback handling is an operational workflow in the merchant portal only; no REST API endpoint exists for dispute objects',
    },
    {
      resource: 'invoice',
      reason:
        'HyperBill invoicing is a separate HyperPay product with no public REST API exposed through the OPPWA payment gateway',
    },
    {
      resource: 'payout',
      reason:
        'HyperSplits payout system is a separate HyperPay product with no public REST API exposed through the OPPWA payment gateway',
    },
    {
      resource: 'plan',
      reason:
        'HyperPay has no subscription billing plan objects; recurring payments use stored card registrations (tokens), not plan/price records',
    },
    {
      resource: 'subscription',
      reason:
        'HyperPay has no subscription objects; recurring billing is handled via token re-use on the payments API, not a subscription lifecycle resource',
    },
  ],
} as const
