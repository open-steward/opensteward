export const metadata = {
  platform: 'swish',
  totalResources: 10,
  availableResources: [
    'charge',
    'customer',
    'payout',
    'refund',
  ],
  unavailableResources: [
    { resource: 'balance-transaction', reason: 'Swish has no balance ledger or settlement API' },
    { resource: 'dispute', reason: 'Swish has no dispute or chargeback API' },
    { resource: 'invoice', reason: 'Swish has no invoicing API' },
    { resource: 'payment-method', reason: 'Swish has no stored payment-method API; auth uses mutual TLS certificates, not tokenised card objects' },
    { resource: 'plan', reason: 'Swish has no plan, price, or product API' },
    { resource: 'subscription', reason: 'Swish recurring-payment consents are not subscription objects and have no list/get subscription endpoint' },
  ],
} as const
