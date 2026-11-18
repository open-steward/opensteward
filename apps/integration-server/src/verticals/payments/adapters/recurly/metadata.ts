export const metadata = {
  platform: 'recurly',
  totalResources: 10,
  availableResources: [
    'charge',
    'customer',
    'invoice',
    'payment-method',
    'plan',
    'refund',
    'subscription',
  ],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason:
        'Recurly v3 API (v2021-02-25) has no balance-transaction or ledger-entry endpoint; it is a billing layer on top of payment gateways and does not expose gateway-level settlement data.',
    },
    {
      resource: 'dispute',
      reason:
        'Recurly v3 API has no /disputes or /chargebacks endpoint; chargeback events are received only via gateway webhooks and managed through the Admin UI.',
    },
    {
      resource: 'payout',
      reason:
        'Recurly v3 API has no /payouts endpoint; Recurly delegates settlement and fund disbursement to the underlying payment gateway.',
    },
  ],
} as const
