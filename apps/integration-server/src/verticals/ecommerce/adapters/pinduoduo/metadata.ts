export const metadata = {
  platform: 'pinduoduo',
  totalResources: 10,
  availableResources: [
    'discount',
    'fulfillment',
    'inventory',
    'location',
    'order',
    'product',
    'refund',
  ],
  unavailableResources: [
    {
      resource: 'collection',
      reason: 'PDD product categories are platform-managed taxonomy nodes (pdd.goods.cats.get); the Open Platform exposes no seller-curated collection or storefront-group API.',
    },
    {
      resource: 'transaction',
      reason: 'PDD does not expose a financial transaction or settlement API to sellers; payment data is not available through the Open Platform.',
    },
    {
      resource: 'customer',
      reason:
        'The Open Platform API catalog has no buyer/customer method, and order receiver data is returned encrypted ("加密字段：包括但不限于 收件人的姓名、电话、收货地址等")',
    },
  ],
} as const
