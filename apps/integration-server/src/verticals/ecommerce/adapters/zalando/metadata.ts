export const metadata = {
  platform: 'zalando',
  totalResources: 10,
  availableResources: [
    'product',
    'inventory',
    'order',
    'fulfillment',
    'location',
  ],
  unavailableResources: [
    {
      resource: 'collection',
      reason: 'Zalando has no collections/categories concept in the zDirect merchant API',
    },
    {
      resource: 'customer',
      reason: 'Zalando manages customers internally; no customer endpoint exists in zDirect',
    },
    {
      resource: 'discount',
      reason: 'No discount/promotion API for zDirect merchants; pricing is managed via the Prices API only',
    },
    {
      resource: 'refund',
      reason: 'Returns are handled by Zalando\'s ZRS (Zalando Return Service); no refund endpoint is exposed to zDirect partners',
    },
    {
      resource: 'transaction',
      reason: 'Payments are fully internal to Zalando; no transaction or payment endpoint exists in the zDirect API',
    },
  ],
} as const
