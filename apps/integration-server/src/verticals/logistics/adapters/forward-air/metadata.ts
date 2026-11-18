export const metadata = {
  platform: 'forward-air',
  totalResources: 8,
  availableResources: [
    'shipment',
    'trackingevent',
    'rate',
    'order',
    'label',
  ],
  unavailableResources: [
    {
      resource: 'carrier',
      reason: 'Forward Air is a single LTL carrier; no /carriers endpoint exists in their web services API',
    },
    {
      resource: 'manifest',
      reason: 'No manifest API concept in Forward Air\'s documented web services (Booking, Quoting, Status, Document services only)',
    },
    {
      resource: 'warehouse',
      reason: 'Forward Air operates airport terminal locations, not pick-and-pack warehouses; no warehouse endpoint exists in their API',
    },
  ],
} as const
