export const metadata = {
  platform: 'iyzico',
  totalResources: 10,
  availableResources: [
    'charge',
    'refund',
    'customer',
    'subscription',
    'plan',
  ],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason: 'No balance ledger API; reporting service provides date-based daily batch exports only, not per-entry ledger records',
    },
    {
      resource: 'dispute',
      reason: 'No API endpoint for chargebacks/disputes; iyzico handles these exclusively through the merchant panel UI',
    },
    {
      resource: 'invoice',
      reason: 'No invoice or billing document API; iyzico does not expose invoice objects via its REST API',
    },
    {
      resource: 'payment-method',
      reason: 'Card storage lookup requires a per-user cardUserKey; no global list endpoint exists to enumerate all stored payment methods',
    },
    {
      resource: 'payout',
      reason: 'Mass payout retrieve requires a merchant-assigned externalId; no list or search endpoint for payouts is documented',
    },
  ],
} as const
