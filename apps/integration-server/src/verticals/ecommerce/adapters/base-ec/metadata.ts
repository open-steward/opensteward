export const metadata = {
  platform: 'base-ec',
  totalResources: 11,
  availableResources: ['product', 'variant', 'collection', 'order'],
  unavailableResources: [
    {
      resource: 'customer',
      reason:
        "BASE's API has no customer resource — buyer name/email/address are embedded read-only fields on the order (GET /1/orders/detail/:unique_key), not a queryable or mutable Customer entity.",
    },
    {
      resource: 'location',
      reason:
        'BASE has no warehouse/location API (https://docs.thebase.in/api/ lists only users, items, categories, item_categories, orders, savings, delivery_companies) — every shop is a single stock pool with no addressable location.',
    },
    {
      resource: 'inventory',
      reason:
        'stock is not held per location, and the canonical InventoryLevel requires a locationId the platform cannot supply — POST /1/items/edit_stock genuinely exists, but reporting a synthetic location id would point every level at a location listLocations (also unimplemented) never returns.',
    },
    {
      resource: 'fulfillment',
      reason:
        'BASE has no standalone fulfillment/shipment resource — marking a line item shipped is a status transition (POST /1/orders/edit_status to `dispatched`, optionally carrying delivery_company_id + tracking_number) on the order item itself, not a distinct object with its own id or GET.',
    },
    {
      resource: 'refund',
      reason:
        "BASE's public API has no refunds resource — refunds are handled by BASE support outside the merchant-facing Apps API.",
    },
    {
      resource: 'transaction',
      reason:
        "BASE's API has no payment-transaction resource — payment method and fee totals are embedded fields on the order (payment, order_charge.collected_fee, c_c_payment_transaction.collected_fee), not enumerable transaction records.",
    },
    {
      resource: 'discount',
      reason:
        "BASE's Apps API documents no coupon/discount resource — BASE's shop-side coupon feature has no public endpoint for third-party apps.",
    },
  ],
} as const
