export const metadata = {
  platform: 'salesforce-commerce-cloud',
  totalResources: 10,
  availableResources: [
    'collection',
    'customer',
    'discount',
    'fulfillment',
    'inventory',
    'location',
    'order',
    'product',
  ],
  unavailableResources: [
    {
      resource: 'refund',
      reason:
        'SCAPI has no refund REST endpoint; order returns are managed exclusively through the Order Management System (OMS) and are not exposed via Shopper Orders or any other SCAPI family.',
    },
    {
      resource: 'transaction',
      reason:
        'SCAPI payment transactions are platform-internal; the ShopperPayments API manages saved payment method references only, not the canonical AUTHORIZATION/CAPTURE/REFUND/VOID transaction lifecycle.',
    },
  ],
} as const
