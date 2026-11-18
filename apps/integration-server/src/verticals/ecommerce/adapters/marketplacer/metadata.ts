export const metadata = {
  platform: 'marketplacer',
  totalResources: 11,
  availableResources: ['product', 'variant', 'collection', 'order', 'refund', 'fulfillment'],
  unavailableResources: [
    {
      resource: 'inventory',
      reason:
        "Marketplacer keeps a single countOnHand per variant with no seller-facing location model, and the canonical InventoryLevel requires a locationId. Reporting stock would mean pinning it to a synthetic location that no location endpoint returns.",
    },
    {
      resource: 'customer',
      reason:
        'Customers belong to the marketplace operator, not the seller: the Seller API exposes ' +
        'no customer/shopper query at all (Reference Docs Queries: advertsWhere, brands, ' +
        'externalIds, invoices, node(s), refundRequests, taxons — no customer).',
    },
    {
      resource: 'transaction',
      reason:
        'Payment capture and payouts (MPay) are operator-run; the Seller API has no ' +
        'transaction/payment query, and the "Automated Payouts" docs live only under the ' +
        'Operator API.',
    },
    {
      resource: 'location',
      reason:
        'No seller-facing warehouse/location query exists in the Seller API Reference Docs ' +
        '(Queries: advertsWhere, brands, externalIds, invoices, node(s), refundRequests, ' +
        'taxons). `shipmentAddresses`/`shipmentCarriers` are shipping-dispatch helpers shown ' +
        'only inside the Creating Shipments how-to, not part of the documented query surface, ' +
        'and their seller-scoping (vs. requiring an explicit sellerId only an Operator would ' +
        'supply) is unconfirmed.',
    },
    {
      resource: 'discount',
      reason:
        'Promotions are configured and owned by the marketplace operator. The Seller API’s ' +
        'entire mutation set is advertUpsert / refundRequestCreate / shipmentCreate — no ' +
        'discount or promotion mutation exists, and no discount/promotion query is documented ' +
        'for sellers either.',
    },
  ],
} as const
