export const metadata = {
  platform: 'shelf-nu',
  totalResources: 7,
  availableResources: ['location', 'product', 'stock-level'],
  unavailableResources: [
    {
      resource: 'supplier',
      reason:
        'Shelf.nu has no supplier concept; it is a physical asset tracker, not a procurement system. No supplier endpoint exists in the mobile or web API.',
    },
    {
      resource: 'purchase-order',
      reason:
        'Shelf.nu has no purchase-order concept. The platform tracks asset custody and locations, not procurement workflows.',
    },
    {
      resource: 'stock-transfer',
      reason:
        'Shelf.nu has no stock-transfer endpoint. Asset location changes are recorded via asset.update-location, but there is no transfer document resource exposed by the API.',
    },
    {
      resource: 'stock-adjustment',
      reason:
        'Shelf.nu has no stock-adjustment endpoint. It tracks individual serialised assets (quantity always 1) and does not expose quantity adjustment documents.',
    },
  ],
} as const
