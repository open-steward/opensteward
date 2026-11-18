export const metadata = {
  platform: 'southeastern-freight',
  totalResources: 8,
  availableResources: [
    'carrier',
    'label',
    'rate',
    'shipment',
    'trackingevent',
  ],
  unavailableResources: [
    {
      resource: 'manifest',
      reason: 'SEFL REST API (Pickup, Tracing, Rate Quotes, Document Retrieval, Get Pro) has no manifest or close-out endpoint',
    },
    {
      resource: 'order',
      reason: 'SEFL is an LTL freight carrier with no order management API',
    },
    {
      resource: 'warehouse',
      reason: 'SEFL exposes no service center or terminal data via REST API',
    },
  ],
} as const
