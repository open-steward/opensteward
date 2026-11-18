export const metadata = {
  platform: 'gofreight',
  totalResources: 8,
  availableResources: ['order', 'shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'UNVERIFIED: GoFreight API spec lives behind a JS-rendered ReDoc SPA (api.gofreight.com) that cannot be fetched; no public documentation surfaces a /carriers endpoint',
    },
    {
      resource: 'label',
      reason:
        'UNVERIFIED: GoFreight API spec lives behind a JS-rendered ReDoc SPA (api.gofreight.com) that cannot be fetched; label printing is documented as a UI-only feature (Tools menu in House AWB), not an API endpoint',
    },
    {
      resource: 'manifest',
      reason:
        'UNVERIFIED: GoFreight API spec lives behind a JS-rendered ReDoc SPA (api.gofreight.com) that cannot be fetched; no public documentation surfaces a /manifests endpoint',
    },
    {
      resource: 'rate',
      reason:
        'UNVERIFIED: GoFreight API spec lives behind a JS-rendered ReDoc SPA (api.gofreight.com) that cannot be fetched; no public documentation surfaces a /rates endpoint',
    },
    {
      resource: 'warehouse',
      reason:
        'UNVERIFIED: GoFreight API spec lives behind a JS-rendered ReDoc SPA (api.gofreight.com) that cannot be fetched; GoFreight does not have a built-in WMS and integrates with third-party WMS systems',
    },
  ],
} as const
