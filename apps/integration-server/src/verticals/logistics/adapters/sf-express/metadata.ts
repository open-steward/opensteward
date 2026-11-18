export const metadata = {
  platform: 'sf-express',
  totalResources: 8,
  availableResources: [
    'trackingevent',
    'shipment',
    'order',
    'rate',
  ],
  unavailableResources: [
    {
      resource: 'carrier',
      reason: 'SF Express is the sole carrier; no carrier-list API exists in the Fengqiao platform',
    },
    {
      resource: 'manifest',
      reason: 'No manifest or end-of-day consolidation concept in the SF Express Fengqiao API',
    },
    {
      resource: 'warehouse',
      reason: 'No warehouse management API in the SF Express Fengqiao platform',
    },
    {
      resource: 'label',
      reason: 'UNVERIFIED: COM_RECE_CLOUD_PRINT_WAYBILLS service code exists in third-party SDKs but response field names (label URL / base64 content key) are not confirmed by any publicly accessible authoritative documentation',
    },
  ],
} as const
