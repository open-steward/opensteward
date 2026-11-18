export const metadata = {
  platform: 'bluedart',
  totalResources: 8,
  availableResources: ['shipment', 'trackingevent', 'label'],
  unavailableResources: [
    { resource: 'carrier', reason: 'BlueDart is a single carrier; no API endpoint exists to list carriers' },
    { resource: 'manifest', reason: 'No dedicated manifest endpoint in the BlueDart REST or SOAP API' },
    { resource: 'order', reason: 'BlueDart has no order management API; the platform covers shipping and tracking only' },
    { resource: 'rate', reason: 'Transit Time Finder returns estimated delivery date only, not pricing; no rate-quote endpoint is documented' },
    { resource: 'warehouse', reason: 'BlueDart has no warehouse management API' },
  ],
} as const
