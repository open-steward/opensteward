export const metadata = {
  platform: 'cdiscount-marketplace',
  totalResources: 11,
  availableResources: ['product', 'inventory', 'order', 'fulfillment'],
  unavailableResources: [
    {
      resource: 'variant',
      reason:
        "Octopia's Product API models each sellable SKU as its own product sheet, keyed by " +
        'sellerExternalReference; there is no separate parent/variant hierarchy exposed by the Seller API.',
    },
    {
      resource: 'collection',
      reason:
        "Octopia's categories (GET /categories) are the fixed marketplace taxonomy every product is " +
        'assigned into (leaf-level only); sellers cannot create or manage their own collections.',
    },
    {
      resource: 'location',
      reason:
        "Octopia's Seller API has no seller warehouse/location resource — stock is scoped to SellerId " +
        'and salesChannelId via GET /seller/v2/offers, not a physical location.',
    },
    {
      resource: 'customer',
      reason:
        'Octopia exposes no customer directory. Buyer identity on an order is limited to a ' +
        'per-order-line shippingAddress (name/email/phone) plus an opaque customer.reference — there ' +
        'is no customer resource sellers can list or fetch independently.',
    },
    {
      resource: 'refund',
      reason:
        "Octopia's returns are physical reverse logistics (inbound RMA tracking), not monetary " +
        'refunds; there is no refund resource in the Seller API.',
    },
    {
      resource: 'transaction',
      reason:
        "Octopia's Financial Management module exposes aggregate seller payouts and billing events, " +
        'not per-order payment transactions.',
    },
    {
      resource: 'discount',
      reason:
        'Octopia has no seller-managed discount/promotion resource; pricing is set per offer ' +
        '(integrationPrice/facialPrice), not via discount codes.',
    },
  ],
} as const
