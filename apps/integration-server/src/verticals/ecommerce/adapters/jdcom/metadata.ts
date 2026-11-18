export const metadata = {
  platform: 'jdcom',
  totalResources: 10,
  availableResources: [
    'product',
    'inventory',
    'order',
    'fulfillment',
    'refund',
    'discount',
  ],
  unavailableResources: [
    {
      resource: 'collection',
      reason: 'JD.com exposes only a read-only platform-level category taxonomy (jingdong.category.read.*); there is no seller-curated collection API.',
    },
    {
      resource: 'customer',
      reason: 'JD.com CRM APIs (jingdong.pop.crm.customer.getCustomer) require the buyer\'s JD PIN as input; no list-all-buyers endpoint exists — buyer PII is not exposed to sellers in bulk.',
    },
    {
      resource: 'location',
      reason: 'JD.com manages its fulfillment centers internally; no seller-facing warehouse or location API is available.',
    },
    {
      resource: 'transaction',
      reason: 'JD.com has no financial transaction or settlement API for marketplace sellers; payment data is not exposed through the open platform.',
    },
  ],
} as const
