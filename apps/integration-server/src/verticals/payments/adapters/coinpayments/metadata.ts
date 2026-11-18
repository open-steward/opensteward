export const metadata = {
  platform: 'coinpayments',
  totalResources: 10,
  availableResources: ['balance-transaction', 'charge'],
  unavailableResources: [
    {
      resource: 'customer',
      reason:
        'CoinPayments is a crypto-checkout gateway with no customer object; buyer details are embedded in the invoice.',
    },
    {
      resource: 'dispute',
      reason:
        'CoinPayments has no dispute/chargeback concept; crypto payments are irreversible and have no card-network dispute mechanism.',
    },
    {
      resource: 'invoice',
      reason:
        'CoinPayments calls its payment requests "invoices" but they are mapped to the canonical Charge resource; no separate recurring-billing Invoice resource exists.',
    },
    {
      resource: 'payment-method',
      reason:
        'CoinPayments has no stored payment-method object; buyers choose a coin at checkout on the hosted page, not via a reusable payment method.',
    },
    {
      resource: 'payout',
      reason:
        'CoinPayments spend requests initiate crypto withdrawals but there is no list/get spend-request endpoint; outgoing transactions appear in the wallet transaction ledger (balance-transaction).',
    },
    {
      resource: 'plan',
      reason:
        'CoinPayments has no subscription billing plane, price, or product catalog; it is a one-time crypto payment gateway.',
    },
    {
      resource: 'refund',
      reason:
        'CoinPayments has no refund object; crypto payments are irreversible on-chain and the API provides no refund endpoint.',
    },
    {
      resource: 'subscription',
      reason:
        'CoinPayments has no subscription or recurring-billing resource; it is a one-time crypto payment gateway.',
    },
  ],
} as const
