export const metadata = {
  platform: 'ordergroove',
  totalResources: 10,
  availableResources: ['customer', 'order', 'product'],
  unavailableResources: [
    {
      resource: 'collection',
      reason:
        'Ordergroove mirrors individual SKUs from the merchant catalog for subscription eligibility — it has no collection/category browsing resource.',
    },
    {
      resource: 'location',
      reason:
        'Ordergroove is a subscription layer bolted onto an existing storefront; it has no warehouse/location resource of its own.',
    },
    {
      resource: 'inventory',
      reason:
        "Stock is owned by the merchant's underlying ecommerce platform — Ordergroove exposes no inventory-level resource.",
    },
    {
      resource: 'fulfillment',
      reason:
        "Ordergroove hands a due subscription order to the merchant's ecommerce platform to actually fulfill; it has no shipment/fulfillment resource.",
    },
    {
      resource: 'refund',
      reason:
        'No refund resource is documented — refunds happen on the underlying commerce platform Ordergroove sits on top of.',
    },
    {
      resource: 'transaction',
      reason:
        "No payment/gateway transaction resource is documented; an Order's `payment` field is an opaque id into a Payments resource this adapter does not implement.",
    },
    {
      resource: 'discount',
      reason:
        'No discount/coupon resource is documented for server-to-server use — incentive/offer configuration is admin-panel only.',
    },
  ],
} as const
