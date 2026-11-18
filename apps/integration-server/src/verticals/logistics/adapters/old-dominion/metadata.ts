export const metadata = {
  platform: 'old-dominion',
  totalResources: 8,
  availableResources: ['carrier', 'label', 'rate', 'shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'manifest',
      reason: 'ODFL REST API (BOL, Pickup, Tracking, Document) has no manifest submission or retrieval endpoint',
    },
    {
      resource: 'order',
      reason: 'ODFL is an LTL freight carrier with no order management API',
    },
    {
      resource: 'warehouse',
      reason: 'ODFL exposes no service center or terminal data via REST API',
    },
  ],
} as const
