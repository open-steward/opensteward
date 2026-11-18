export const metadata = {
  platform: 'wayfair',
  totalResources: 10,
  availableResources: ['order', 'fulfillment', 'inventory'],
  unavailableResources: [
    {
      resource: 'collection',
      reason:
        'Wayfair Supplier GraphQL API has no product-catalog or collection endpoints; catalog management is handled internally by Wayfair.',
    },
    {
      resource: 'customer',
      reason:
        'Wayfair Supplier GraphQL API does not expose end-customer records; customer identity is embedded in PO ship-to fields only.',
    },
    {
      resource: 'discount',
      reason:
        'Wayfair Supplier GraphQL API has no discount or promotion endpoints; promotions are managed entirely by Wayfair.',
    },
    {
      resource: 'location',
      reason:
        'Wayfair Supplier GraphQL API has no standalone warehouse/location query; warehouse data appears only as embedded fields on purchase orders.',
    },
    {
      resource: 'product',
      reason:
        'Wayfair Supplier GraphQL API has no product read/write endpoints accessible to suppliers; the product catalog is managed by Wayfair internally.',
    },
    {
      resource: 'refund',
      reason:
        'Wayfair Supplier GraphQL API has no refund endpoint; returns and refunds are handled through Wayfair\'s internal customer service processes.',
    },
    {
      resource: 'transaction',
      reason:
        'Wayfair Supplier GraphQL API has no transaction or payment endpoint; supplier payments are processed by Wayfair outside the API.',
    },
  ],
} as const
