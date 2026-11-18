export const metadata = {
  platform: 'korona-pos',
  totalResources: 10,
  availableResources: [
    'product',
    'collection',
    'location',
    'inventory',
    'customer',
    'order',
    'transaction',
    'discount',
  ],
  unavailableResources: [
    {
      resource: 'fulfillment',
      reason: 'KORONA is a retail point-of-sale system — there is no shipment/fulfillment concept anywhere in the spec.',
    },
    {
      resource: 'refund',
      reason:
        'No distinct refund resource: a refund is a new receipt referencing the original via ' +
        "reversedReceipt, with cancelled/reversal booleans on Receipt — not a separate, " +
        'listable resource matching the canonical Refund shape (orderId, refundLineItems, …).',
    },
  ],
} as const
