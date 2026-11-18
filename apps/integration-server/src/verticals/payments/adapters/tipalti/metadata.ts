export const metadata = {
  platform: 'tipalti',
  totalResources: 10,
  availableResources: ['charge', 'customer', 'invoice'],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason:
        'Tipalti REST API v1 does not expose a balance-transaction resource; ledger-level balance data is not available via the modern REST API.',
    },
    {
      resource: 'dispute',
      reason:
        'Tipalti is an AP-automation / mass-payout platform; chargeback disputes are not modelled in the REST API.',
    },
    {
      resource: 'payment-method',
      reason:
        'Payee payment-method details are embedded on the payee object and collected via hosted iFrame; no standalone payment-method list or get endpoint exists.',
    },
    {
      resource: 'payout',
      reason:
        'Outbound disbursements (payments) map to the canonical Charge; there is no separate payout concept in the Tipalti REST API.',
    },
    {
      resource: 'plan',
      reason:
        'Tipalti does not offer subscription billing; plan / price / product resources are absent from the REST API.',
    },
    {
      resource: 'refund',
      reason:
        'Tipalti REST API v1 has no refund endpoint; payment reversals are handled out-of-band and not exposed as a queryable resource.',
    },
    {
      resource: 'subscription',
      reason:
        'Tipalti does not offer subscription billing; recurring-payment scheduling is absent from the REST API.',
    },
  ],
} as const
