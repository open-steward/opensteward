export const metadata = {
  platform: 'alibaba',
  totalResources: 10,
  availableResources: [
    'product',
    'order',
    'inventory',
    'fulfillment',
    'collection',
    'location',
  ],
  unavailableResources: [
    {
      resource: 'discount',
      reason: 'Promotion API requires separate partner-level scope not available in the standard ICBU Open Platform',
    },
    {
      resource: 'refund',
      reason: 'Dispute/refund API requires separate Trade Assurance scope; no alibaba.icbu.trade.refund endpoint in the standard ICBU API',
    },
    {
      resource: 'transaction',
      reason: 'No financial transaction API is exposed to ICBU sellers; payment settlement data is not available via the Open Platform',
    },
    {
      resource: 'customer',
      reason:
        'The Open Platform documents no buyer list, and the order list rows carry only "trade_id", "trade_status", "create_date" and "modify_date".',
    },
  ],
} as const
