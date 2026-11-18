export const metadata = {
  platform: 'yto-express',
  totalResources: 8,
  availableResources: ['shipment', 'trackingevent'],
  unavailableResources: [
    { resource: 'carrier', reason: 'UNVERIFIED: open.yto.net.cn developer portal requires authenticated account; no publicly documented carrier-listing endpoint found' },
    { resource: 'label', reason: 'UNVERIFIED: open.yto.net.cn behind login; label_url is a field on the order response, but a standalone /labels endpoint with list/get/void operations is unconfirmed' },
    { resource: 'manifest', reason: 'UNVERIFIED: open.yto.net.cn behind login; no publicly documented manifest or end-of-day consolidation endpoint found' },
    { resource: 'order', reason: 'UNVERIFIED: open.yto.net.cn behind login; POST orders is the shipment-creation endpoint — a fulfillment-order listing endpoint is unconfirmed' },
    { resource: 'rate', reason: 'UNVERIFIED: open.yto.net.cn behind login; no publicly accessible rate-query endpoint URL or field names confirmed' },
    { resource: 'warehouse', reason: 'UNVERIFIED: open.yto.net.cn behind login; no publicly documented warehouse management endpoint found' },
  ],
} as const
