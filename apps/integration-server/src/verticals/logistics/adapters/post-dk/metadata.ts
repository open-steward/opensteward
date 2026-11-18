export const metadata = {
  platform: 'post-dk',
  totalResources: 8,
  availableResources: ['shipment', 'trackingevent', 'label'],
  unavailableResources: [
    { resource: 'carrier', reason: 'PostNord DK is a single-carrier service; the REST API has no endpoint that returns carrier records' },
    { resource: 'manifest', reason: 'No manifest or pickup-sheet endpoint exists in the PostNord DK REST API' },
    { resource: 'order', reason: 'PostNord DK is a carrier/postal operator, not a WMS/OMS; no order management endpoint exists' },
    { resource: 'rate', reason: 'PostNord DK has no native rate/pricing API (confirmed by third-party integration documentation)' },
    { resource: 'warehouse', reason: 'No warehouse management endpoint exists in the PostNord DK REST API' },
  ],
} as const
