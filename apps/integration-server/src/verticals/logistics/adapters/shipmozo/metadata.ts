export const metadata = {
  platform: 'shipmozo',
  totalResources: 8,
  availableResources: ['shipment', 'rate', 'label', 'manifest', 'warehouse'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'ShipMozo is a courier aggregator with no list-carriers endpoint; the only carrier-related endpoint is POST /create-shipper (registers a shipper account), not a carrier directory.',
    },
    {
      resource: 'order',
      reason:
        'GET /get-order-detail/{order_id} documents no response fields ("Successful operation" only).',
    },
    {
      resource: 'trackingevent',
      reason: 'GET /track-order documents "scan_detail": [] with no fields for its entries.',
    },
  ],
} as const
