export const metadata = {
  platform: 'peach-payments',
  totalResources: 10,
  availableResources: ['charge', 'customer', 'refund'],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason:
        'No balance-transaction ledger API. The Reconciliation API returns settlement reconciliation data per transaction but not a balance ledger object.',
    },
    {
      resource: 'dispute',
      reason:
        'Chargebacks/disputes are managed through the Peach Payments dashboard only; no public REST API endpoint is documented.',
    },
    {
      resource: 'invoice',
      reason:
        'No invoice resource API. Invoicing is handled through a Xero integration on the dashboard, not via REST.',
    },
    {
      resource: 'payment-method',
      reason:
        'Card registrations (tokens) can be created but there is no documented GET/LIST endpoint to retrieve stored payment methods.',
    },
    {
      resource: 'payout',
      reason:
        'UNVERIFIED: Payouts API exists (payouts.peachpayments.com) but uses a separate OAuth auth scheme incompatible with the adapter\'s API-key (Bearer) credentials; cannot confirm accessibility via the same credential set.',
    },
    {
      resource: 'plan',
      reason:
        'No plan/billing-plan resource API; Peach Payments has no subscription billing catalog.',
    },
    {
      resource: 'subscription',
      reason:
        'No subscription object or endpoint; recurring billing is implemented via stored registration tokens and merchant-side scheduling, not a first-class subscription resource.',
    },
  ],
} as const
