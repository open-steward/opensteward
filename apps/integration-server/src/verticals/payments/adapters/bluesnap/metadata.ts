export const metadata = {
  platform: 'bluesnap',
  totalResources: 10,
  availableResources: [
    'charge',
    'customer',
    'refund',
    'subscription',
    'plan',
    'payment-method',
  ],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason:
        'No dedicated Payment API endpoint; data is only accessible via the separate Reporting API (TransactionDetail report).',
    },
    {
      resource: 'dispute',
      reason:
        'BlueSnap chargebacks have only a representment-upload endpoint (/services/2/chargeback/upload_representment); no list or get API exists in the Payment API.',
    },
    {
      resource: 'invoice',
      reason:
        'BlueSnap invoicing is a separate accounts-receivable product with no Payment API endpoint for listing or retrieving invoices.',
    },
    {
      resource: 'payout',
      reason:
        'Payout data is accessible only via the Reporting API (Payout Detail report), not as a REST resource endpoint in the Payment API.',
    },
  ],
} as const
