export const metadata = {
  platform: 'cscart',
  totalResources: 10,
  availableResources: [
    'collection',
    'customer',
    'discount',
    'fulfillment',
    'inventory',
    'order',
    'product',
  ],
  unavailableResources: [
    {
      resource: 'refund',
      reason:
        'CS-Cart has no REST API endpoint for refunds. Returns are handled by the optional RMA add-on which has no documented REST surface; the orders object exposes only a bare credit_memo_id reference field with no associated CRUD endpoint.',
    },
    {
      resource: 'transaction',
      reason:
        'CS-Cart has no REST API endpoint for payment transactions. The /api/payments endpoint covers payment method configurations only. The payment_info field on orders is an opaque, undocumented array with no associated transaction-level endpoint.',
    },
    {
      resource: 'location',
      reason:
        'The REST API documents no warehouse or location entity (Supported Entities: https://docs.cs-cart.com/latest/developer_guide/api/entities/index.html)',
    },
  ],
} as const
