export const metadata = {
  platform: 'conekta',
  totalResources: 10,
  availableResources: [
    'charge',
    'customer',
    'refund',
    'balance-transaction',
    'payout',
    'plan',
  ],
  unavailableResources: [
    {
      resource: 'subscription',
      reason:
        'Subscriptions are only accessible per-customer at GET /customers/{id}/subscriptions; no global list endpoint exists and the listSubscriptions interface provides no customerId.',
    },
    {
      resource: 'payment-method',
      reason:
        'Payment sources are only accessible per-customer at GET /customers/{id}/payment_sources; the listPaymentMethods interface provides no customerId.',
    },
    {
      resource: 'dispute',
      reason:
        'Conekta has no dedicated dispute/chargeback list endpoint; chargebacks are nested within order objects and are only surfaced as webhook events (charge.chargeback).',
    },
    {
      resource: 'invoice',
      reason:
        'The Conekta invoice endpoint (services.conekta.com/reports/v1/invoices) is a billing-commission report on a separate host returning company-level fee summaries, not standard payment invoices; it does not map to the canonical Invoice schema.',
    },
  ],
} as const
