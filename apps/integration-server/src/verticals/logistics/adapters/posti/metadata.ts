export const metadata = {
  platform: 'posti',
  totalResources: 8,
  availableResources: [
    'shipment',
    'trackingevent',
  ],
  unavailableResources: [
    {
      resource: 'carrier',
      reason: 'No carrier listing endpoint exists in any Posti REST API (api.posti.fi or ecom-api.posti.com).',
    },
    {
      resource: 'label',
      reason: 'Labels are embedded in the shipment response as label_url; no standalone /labels endpoint exists in the Posti API.',
    },
    {
      resource: 'manifest',
      reason: 'No manifest endpoint exists in any Posti REST API.',
    },
    {
      resource: 'order',
      reason: 'UNVERIFIED: Orders API exists at ecom-api.posti.com/ecommerce/v3/orders (OAuth), which is a different base URL and auth scheme from this adapter\'s api.posti.fi/v3/ API key client.',
    },
    {
      resource: 'rate',
      reason: 'No rate quoting endpoint exists in any Posti REST API; shipping-methods list is only available in the separately-authenticated Nextshipping API.',
    },
    {
      resource: 'warehouse',
      reason: 'UNVERIFIED: Warehouses API exists at ecom-api.posti.com/v2/warehouses (OAuth), which is a different base URL and auth scheme from this adapter\'s api.posti.fi/v3/ API key client.',
    },
  ],
} as const
