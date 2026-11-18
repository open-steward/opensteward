export const metadata = {
  platform: 'bitso-business',
  totalResources: 10,
  availableResources: [
    'balance-transaction',
    'charge',
    'payout',
  ],
  unavailableResources: [
    {
      resource: 'customer',
      reason: 'UNVERIFIED: Customer management endpoints (money-transmitter tier) appear in the llms.txt index but docs are gated behind a business account; no public path or response schema could be confirmed.',
    },
    {
      resource: 'dispute',
      reason: 'Bitso Business is a crypto/fiat-rails processor (SPEI, PIX, on-chain); no dispute or chargeback mechanism exists in the API.',
    },
    {
      resource: 'invoice',
      reason: 'Bitso Business has no invoicing concept; it moves funds via crypto and local payment rails, not invoice-based billing.',
    },
    {
      resource: 'payment-method',
      reason: 'Bitso Business uses network-level rails (SPEI, PIX, blockchain addresses) rather than stored card or wallet payment methods.',
    },
    {
      resource: 'plan',
      reason: 'Bitso Business has no subscription plan or pricing concept; it is a fund-movement API, not a billing platform.',
    },
    {
      resource: 'refund',
      reason: 'Bitso Business provides no refund endpoint; incoming fundings (pay-ins) cannot be reversed through the API.',
    },
    {
      resource: 'subscription',
      reason: 'Bitso Business has no recurring billing or subscription concept; it is a fund-movement API.',
    },
  ],
} as const
