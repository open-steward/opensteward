export const metadata = {
  platform: 'loadsmart',
  totalResources: 8,
  availableResources: ['carrier', 'order', 'rate', 'shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'label',
      reason:
        'Loadsmart is a freight TMS/broker (FTL); no parcel label or BOL generation API exists on api.loadsmart.com/v2',
    },
    {
      resource: 'manifest',
      reason: 'No manifest concept in the Loadsmart ShipperGuide freight TMS API',
    },
    {
      resource: 'warehouse',
      reason:
        'No warehouse endpoints on the ShipperGuide API (api.loadsmart.com/v2); Opendock facility management is a separate product at a different base URL (neutron.opendock.com)',
    },
  ],
} as const
