export const metadata = {
  platform: 'warp',
  totalResources: 8,
  availableResources: ['rate', 'shipment', 'trackingevent', 'order'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason: 'Warp is itself the carrier (asset-light freight network); no carrier-listing API endpoint exists',
    },
    {
      resource: 'warehouse',
      reason: 'Warp operates its own hub ("Warp Station") network; there is no warehouse-listing API endpoint for customers',
    },
    {
      resource: 'label',
      reason: 'Warp is a freight (LTL/FTL) network; parcel shipping labels are not a concept — BOL/POD documents are retrieved via /documents post-shipment',
    },
    {
      resource: 'manifest',
      reason: 'No manifest endpoint exists in the Warp API; the platform does not support manifest creation or listing',
    },
  ],
} as const
