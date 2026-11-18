export const metadata = {
  platform: 'crossmint',
  totalResources: 10,
  availableResources: [
    'charge',
  ],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason: 'Crossmint has no balance/ledger API; wallet transactions are on-chain execution records, not accounting entries with gross/fee/net.',
    },
    {
      resource: 'customer',
      reason: 'Crossmint has no standalone customer object; buyer identity is embedded in each order as a recipient email/wallet address.',
    },
    {
      resource: 'dispute',
      reason: 'Crossmint does not expose a disputes API; blockchain payments are irreversible and chargebacks are handled outside the platform.',
    },
    {
      resource: 'invoice',
      reason: 'Crossmint has no invoice API; checkout is order-centric with no separate invoicing surface.',
    },
    {
      resource: 'payment-method',
      reason: 'Crossmint has no stored payment-method objects; payment details (card/crypto) are captured per-order and not addressable independently.',
    },
    {
      resource: 'payout',
      reason: 'Crossmint stablecoin transfers (POST /wallets/{locator}/tokens/{token}/transfers) are wallet-to-wallet blockchain transactions, not canonical payout objects with status/arrival-date.',
    },
    {
      resource: 'plan',
      reason: 'Crossmint has no plan/price/product catalog API; subscription pricing is defined per NFT collection, not as reusable plan records.',
    },
    {
      resource: 'refund',
      reason: 'Crossmint has no refund endpoint; blockchain payments are irreversible.',
    },
    {
      resource: 'subscription',
      reason: 'Crossmint exposes only a cancel endpoint for NFT-based subscriptions (PATCH /2022-06-09/subscriptions/{locator}/cancel); there is no list or get endpoint to sync subscription state.',
    },
  ],
} as const
