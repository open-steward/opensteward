export const metadata = {
  platform: 'sendparcel',
  totalResources: 8,
  availableResources: ['label', 'order', 'rate', 'shipment', 'carrier'],
  unavailableResources: [
    {
      resource: 'manifest',
      reason:
        'SendParcel REST API (SP-API-EN.pdf) has no manifest concept or endpoint; the platform is an order-booking aggregator with no pickup-closeout manifest workflow.',
    },
    {
      resource: 'warehouse',
      reason:
        'SendParcel REST API (SP-API-EN.pdf) has no warehouse concept or endpoint; shipments are dispatched from sender addresses, not managed warehouse locations.',
    },
    {
      resource: 'trackingevent',
      reason:
        'POST /rest-api/tracks returns one order\'s tracking by "orderTrack":{"required":["id"]} and the API has no tracking collection (https://api.sendparcel.com/rest-api/doc)',
    },
  ],
} as const
