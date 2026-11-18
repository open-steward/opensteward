export const metadata = {
  platform: 'temu',
  totalResources: 10,
  availableResources: [
    'customer',
    'order',
    'product',
    'refund',
  ],
  unavailableResources: [
    {
      resource: 'collection',
      reason: 'Temu has no seller-managed collection concept; bg.local.goods.cats.get returns platform taxonomy categories only',
    },
    {
      resource: 'discount',
      reason: 'No seller-facing discount or coupon API exists on the Temu Open Platform',
    },
    {
      resource: 'location',
      reason: 'UNVERIFIED: Third-party integrators report a location feed but no bg.* method name is publicly documented; API docs are behind login',
    },
    {
      resource: 'transaction',
      reason: 'No payment settlement or transaction query API is exposed to sellers via the Temu Open Platform',
    },
    {
      resource: 'fulfillment',
      reason:
        'The only documented package list, bg.order.unshipped.package.get, returns "Total number of unshipped packages" only, and bg.logistics.shipment.v2.get looks up one sub-order by parentOrderSn and orderSn',
    },
    {
      resource: 'inventory',
      reason:
        'bg.local.goods.sku.list.query reports "stock [INTEGER] :: Stock quantity" per SKU with no location, and an inventory level requires one',
    },
  ],
} as const
