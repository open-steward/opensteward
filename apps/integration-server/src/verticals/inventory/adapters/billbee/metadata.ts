export const metadata = {
  platform: 'billbee',
  totalResources: 7,
  availableResources: ['location', 'product', 'stock-level'],
  unavailableResources: [
    {
      resource: 'purchase-order',
      reason: 'Billbee REST API has no purchase-order endpoints; inbound procurement is not part of the platform API (confirmed via Swagger spec at app.billbee.io/swagger/docs/v1)',
    },
    {
      resource: 'stock-adjustment',
      reason: 'Billbee REST API exposes only write-only stock update endpoints (POST /products/updatestock); no GET endpoint exists for listing or retrieving stock adjustment history',
    },
    {
      resource: 'stock-transfer',
      reason: 'Billbee REST API has no stock-transfer endpoints; warehouse-to-warehouse transfers are not exposed via the API (confirmed via Swagger spec at app.billbee.io/swagger/docs/v1)',
    },
    {
      resource: 'supplier',
      reason: 'Billbee REST API has no supplier endpoints; vendor/supplier management is not part of the platform API (confirmed via Swagger spec at app.billbee.io/swagger/docs/v1)',
    },
  ],
} as const
