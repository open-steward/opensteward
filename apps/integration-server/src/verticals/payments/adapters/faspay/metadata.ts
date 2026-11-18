export const metadata = {
  platform: 'faspay',
  totalResources: 10,
  availableResources: ['charge'],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason:
        'Faspay has no balance-transaction ledger API; the debit and credit-card APIs expose only per-transaction inquiry — no settlement or fee breakdown feed.',
    },
    {
      resource: 'customer',
      reason:
        'Faspay has no customer resource; customer details (cust_no, cust_name) are embedded inline in each transaction and are not addressable independently.',
    },
    {
      resource: 'dispute',
      reason:
        'Faspay has no dispute or chargeback API; dispute handling is managed outside the REST API via the merchant dashboard.',
    },
    {
      resource: 'invoice',
      reason:
        'Faspay Billing (CreateBilling) generates a payment link but exposes no retrievable invoice resource or list endpoint.',
    },
    {
      resource: 'payment-method',
      reason:
        'Faspay has no stored payment-method resource; payment channel selection is done per-transaction and not persisted as a retrievable object.',
    },
    {
      resource: 'payout',
      reason:
        'Faspay has no payout API; merchant settlement is initiated by Faspay internally (D+0 to D+3 depending on channel) with no REST endpoint.',
    },
    {
      resource: 'plan',
      reason:
        'Faspay has no plan or price resource; recurring-payment parameters (period, start date, end date) are specified inline per transaction registration.',
    },
    {
      resource: 'refund',
      reason:
        'Faspay credit-card refunds use a non-REST form-POST endpoint (/fpg.faspay.co.id/payment/api with transactiontype=11); the Online-Debit API used by this adapter has no refund endpoint — reversals surface as payment_status_code=4 on the original transaction.',
    },
    {
      resource: 'subscription',
      reason:
        'Faspay has no subscription resource; recurring credit-card billing registers individual member transactions but exposes no subscription management endpoints.',
    },
  ],
} as const
