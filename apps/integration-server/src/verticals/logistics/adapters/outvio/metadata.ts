export const metadata = {
  platform: 'outvio',
  totalResources: 8,
  availableResources: ['label', 'order', 'rate', 'shipment'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'UNVERIFIED: Outvio API documentation is gated behind a "Request full docs" form; no public endpoint for listing carriers was found.',
    },
    {
      resource: 'manifest',
      reason:
        'UNVERIFIED: Outvio API documentation is gated behind a "Request full docs" form; no public endpoint for manifests was found.',
    },
    {
      resource: 'warehouse',
      reason:
        'UNVERIFIED: Outvio API documentation is gated behind a "Request full docs" form; no public endpoint for warehouses was found.',
    },
    {
      resource: 'trackingevent',
      reason:
        'The Outvio API (https://developers.outvio.com/openapi.json) documents GET only for /v1/order/batch/{batchId}, /v1/order/labels/{orderOrOtn}, /courier/list, /v1/courier/services/warehouse/{warehouseName}, /v1/courier, /v1/courier/{warehouseId}, /v1/warehouse, /v1/shipping-list and /v1/shipping-list/history; there is no tracking collection',
    },
  ],
} as const
