export const metadata = {
  platform: 'itemit',
  totalResources: 7,
  availableResources: ['location', 'product'],
  unavailableResources: [
    {
      resource: 'purchase-order',
      reason: 'itemit is an asset-tracking platform with no procurement workflow; no purchase-order endpoint exists in its REST API',
    },
    {
      resource: 'stock-adjustment',
      reason: 'itemit has no stock-adjustment concept or endpoint; quantity changes are implicit in asset check-in/check-out, not exposed as adjustments',
    },
    {
      resource: 'stock-level',
      reason: 'itemit exposes per-location item counts (_itemCount) on location-profiles but has no dedicated stock-level endpoint returning {productId, locationId, quantityOnHand}',
    },
    {
      resource: 'stock-transfer',
      reason: 'itemit has no stock-transfer concept or endpoint; asset movement between locations is tracked via check-in/check-out bookings, not transfer records',
    },
    {
      resource: 'supplier',
      reason: 'itemit has no supplier/vendor management feature or endpoint in its REST API',
    },
  ],
} as const
