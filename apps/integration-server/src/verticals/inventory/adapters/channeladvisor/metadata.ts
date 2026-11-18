export const metadata = {
  platform: 'channeladvisor',
  totalResources: 7,
  availableResources: ['location', 'product', 'stock-level'],
  unavailableResources: [
    {
      resource: 'purchase-order',
      reason: 'ChannelAdvisor REST API v1 has no purchase-order endpoints; inbound procurement is not exposed via the API (confirmed by adapter docs, SOAP service inventory, and third-party integration sources — SOAP InventoryService covers only product stock CRUD)',
    },
    {
      resource: 'stock-adjustment',
      reason: 'ChannelAdvisor REST API v1 has no stock-adjustment endpoints; the API exposes only DCQuantities (current stock levels) with no adjustment history or event log',
    },
    {
      resource: 'stock-transfer',
      reason: 'ChannelAdvisor REST API v1 has no stock-transfer endpoints; inter-location transfers are not exposed via the API (confirmed by adapter docs and absence from all known REST and SOAP service listings)',
    },
    {
      resource: 'supplier',
      reason: 'ChannelAdvisor REST API v1 has no supplier endpoints; vendor/supplier management is not part of the platform API (confirmed by adapter docs and absence from all known REST and SOAP service listings)',
    },
  ],
} as const
