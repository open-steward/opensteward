export const metadata = {
  platform: 'gmarket',
  totalResources: 10,
  availableResources: [
    'product',
    'inventory',
    'order',
    'fulfillment',
  ],
  unavailableResources: [
    {
      resource: 'collection',
      reason: 'Gmarket has no user-mutable collection API; the platform uses fixed category trees managed internally.',
    },
    {
      resource: 'customer',
      reason: 'Gmarket does not expose a standalone buyer/customer resource to sellers; buyer info is embedded in orders only.',
    },
    {
      resource: 'location',
      reason: 'Gmarket does not expose seller locations via API.',
    },
    {
      resource: 'refund',
      reason: 'UNVERIFIED: A return/refund inquiry endpoint exists in the Gmarket ESM Plus API (sa2.esmplus.com/claim/v1/sa/Returns) but it uses a different base URL and auth system (ESM Plus, etapi.gmarket.com) from this adapter\'s api.gmarket.co.kr base; compatibility is unconfirmed.',
    },
    {
      resource: 'transaction',
      reason: 'UNVERIFIED: A sales settlement inquiry endpoint exists in the Gmarket ESM Plus API (sa2.esmplus.com/account/v1/settle/getsettleorder) but it uses a different base URL and auth system from this adapter\'s api.gmarket.co.kr base; compatibility is unconfirmed.',
    },
    {
      resource: 'discount',
      reason: 'UNVERIFIED: A seller discount API exists in the Gmarket ESM Plus system (sa2.esmplus.com/item/v1/goods/{goodsNo}/seller-discounts) but it is product-scoped and uses a different base URL/system from this adapter\'s api.gmarket.co.kr base; compatibility is unconfirmed.',
    },
  ],
} as const
