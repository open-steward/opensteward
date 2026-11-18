export const metadata = {
  platform: 'unzer',
  totalResources: 10,
  availableResources: [
    'charge',
    'customer',
    'payment-method',
    'payout',
    'refund',
  ],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason:
        'Unzer exposes no dedicated balance/settlement endpoint; transaction history is embedded in the payment aggregate (GET /v1/payments/{id}) only.',
    },
    {
      resource: 'dispute',
      reason:
        'Chargebacks are surfaced as payment state 5 (chargeback) on GET /v1/payments/{id}; there is no dedicated dispute list or get endpoint.',
    },
    {
      resource: 'invoice',
      reason:
        '"Invoice" in Unzer is a payment-type family (paylater-invoice); there is no /v1/invoices billing-invoice resource.',
    },
    {
      resource: 'plan',
      reason:
        'Unzer has no subscription plan, product, or price resource; recurring billing is a flag on a payment type (POST /v1/types/{id}/recurring), not a standalone billing catalog.',
    },
    {
      resource: 'subscription',
      reason:
        'Recurring payments are enabled via POST /v1/types/{id}/recurring (a flag on the payment type); there is no subscription resource or /v1/subscriptions endpoint.',
    },
  ],
} as const
