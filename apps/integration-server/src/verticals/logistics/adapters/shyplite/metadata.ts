export const metadata = {
  platform: 'shyplite',
  totalResources: 8,
  availableResources: [
    'order',
    'trackingevent',
    'shipment',
    'rate',
  ],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'UNVERIFIED: Shyplite v0 API docs are not publicly accessible; no carrier-list endpoint was found in any indexed source (legacy SDK only exposes serviceability/rate-check, not a courier catalogue).',
    },
    {
      resource: 'label',
      reason:
        'UNVERIFIED: Only the legacy api.shyplite.com/getSlip endpoint is documented (returns s3Path, AWB, file name); no equivalent label endpoint exists in the app.shyplite.com/api/v0 base URL used by this adapter.',
    },
    {
      resource: 'manifest',
      reason:
        'UNVERIFIED: Only the legacy api.shyplite.com/getManifestPDF endpoint is documented (accepts manifest_id from shipment response); no equivalent manifest endpoint exists in the v0 API.',
    },
    {
      resource: 'warehouse',
      reason:
        'UNVERIFIED: No warehouse or pickup-location listing endpoint was found in any accessible Shyplite API documentation for either the legacy or v0 API.',
    },
  ],
} as const
