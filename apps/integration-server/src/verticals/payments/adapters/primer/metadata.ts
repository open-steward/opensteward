export const metadata = {
  platform: 'primer',
  totalResources: 10,
  availableResources: ['charge', 'customer', 'refund', 'payment-method'],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason: 'Primer offers CSV reconciliation reports only; no balance-transaction REST API',
    },
    {
      resource: 'dispute',
      reason:
        'Disputes are delivered via DISPUTE.STATUS webhooks only; no REST list/get endpoint exists',
    },
    {
      resource: 'invoice',
      reason: 'Primer is a payment orchestration layer with no invoicing surface',
    },
    {
      resource: 'payout',
      reason: "Primer's settlement data is available as CSV reports only; no payout REST API",
    },
    {
      resource: 'plan',
      reason: 'Primer does not manage subscription plans or products',
    },
    {
      resource: 'subscription',
      reason:
        'Primer handles recurring payments via the Payments API (paymentType: SUBSCRIPTION), not as distinct subscription records',
    },
  ],
} as const
