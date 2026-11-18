export const metadata = {
  platform: 'idosell',
  totalResources: 10,
  availableResources: ['product', 'collection', 'location', 'inventory', 'customer', 'order', 'refund'],
  unavailableResources: [
    {
      resource: 'fulfillment',
      reason:
        'No listable Fulfillment resource with its own id: dispatch/tracking/courier data ' +
        '(orderscourierput, ordersdeliveryaddressput, packageslabelspost) lives embedded on the ' +
        'order or as documents with no own list/get endpoint we could verify.',
    },
    {
      resource: 'transaction',
      reason:
        'GET /payments/payments (paymentspaymentsget) only looks up a single payment by a known ' +
        "composite paymentNumber ('<orderNumber>-<ordinalNumber>') + sourceType; no endpoint " +
        "lists an order's payments, so transactions cannot be enumerated.",
    },
    {
      resource: 'discount',
      reason:
        'No discount/coupon-code management endpoint is documented. productPromotion / ' +
        'productDiscount are per-product promotional pricing attributes, not a canonical ' +
        'redeemable Discount resource with its own id, code, and usage tracking.',
    },
  ],
} as const
