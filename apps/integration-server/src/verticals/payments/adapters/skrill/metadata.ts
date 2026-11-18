export const metadata = {
  platform: 'skrill',
  totalResources: 10,
  availableResources: ['charge', 'customer', 'refund'],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason:
        'UNVERIFIED: The gateway.skrill.com/api REST base URL used by this adapter is not confirmed in public docs; real Skrill MQI uses https://www.skrill.com/app/query.pl with form-POST and CSV/XML responses — cannot confirm a /balance-transactions JSON endpoint exists.',
    },
    {
      resource: 'dispute',
      reason:
        'Skrill has no dispute or chargeback API endpoint; disputes are handled outside the merchant API (no documented endpoint in MQI or PSD2 API reference).',
    },
    {
      resource: 'invoice',
      reason: 'Skrill has no invoice concept or API; it is a wallet/payment gateway, not an invoicing platform.',
    },
    {
      resource: 'payment-method',
      reason:
        'Skrill has no API for listing or retrieving stored payment methods; payment instruments are tied to the Skrill wallet account itself with no merchant-accessible endpoint.',
    },
    {
      resource: 'payout',
      reason:
        'UNVERIFIED: Skrill has a documented Send Money/Payout API but it uses https://www.skrill.com/app/api.pl with form-POST and XML responses — a different base URL and protocol than the adapter; cannot confirm a JSON /payouts endpoint at gateway.skrill.com/api.',
    },
    {
      resource: 'plan',
      reason:
        'Skrill has no plan, product, or pricing tier concept in its API; billing plans are not a Skrill platform feature.',
    },
    {
      resource: 'subscription',
      reason:
        'Skrill recurring-payment MQI actions (status_rec, cancel_rec) exist but return only minimal status codes and dates — no customer ID, currency, items, or other fields required by the canonical Subscription schema.',
    },
  ],
} as const
