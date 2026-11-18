export const metadata = {
  platform: 'daraz',
  totalResources: 10,
  availableResources: [
    'collection',
    'fulfillment',
    'inventory',
    'order',
    'product',
    'transaction',
  ],
  unavailableResources: [
    {
      resource: 'customer',
      reason: 'Daraz Open Platform does not expose buyer/customer profile data; marketplace withholds buyer PII from sellers.',
    },
    {
      resource: 'discount',
      reason: 'No seller-facing promotions or discount/voucher management API exists in the Daraz Open Platform.',
    },
    {
      resource: 'location',
      reason: 'Daraz manages warehouse locations internally; no location or warehouse listing API is available to sellers.',
    },
    {
      resource: 'refund',
      reason: 'Refunds are handled through the Daraz dispute resolution portal; no REST refund endpoint is available.',
    },
  ],
} as const
