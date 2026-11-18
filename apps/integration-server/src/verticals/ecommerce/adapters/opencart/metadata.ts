export const metadata = {
  platform: 'opencart',
  totalResources: 10,
  availableResources: [
    'collection',
    'customer',
    'discount',
    'inventory',
    'location',
    'order',
    'product',
    'refund',
  ],
  unavailableResources: [
    {
      resource: 'fulfillment',
      reason:
        'OpenCart has no native REST API endpoint for shipments or fulfillments. The oc_order_shipment database table (introduced in 3.0.3.7) is not exposed through any catalog/controller/api controller; shipment tracking data is only accessible via admin UI or paid third-party REST Admin API extensions.',
    },
    {
      resource: 'transaction',
      reason:
        'OpenCart has no native REST API endpoint for payment transaction records. The catalog/controller/account/transaction.php is a storefront HTML page for reward-point account credits, not a payment ledger API. Payment gateway transaction data is not exposed via the OpenCart REST API.',
    },
  ],
} as const
