export const metadata = {
  platform: 'trimble-tms',
  totalResources: 8,
  availableResources: ['rate', 'shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'UNVERIFIED: The Trimble TMS next-gen REST API (api.trimble.com/tms/v1) is in pre-release beta with no publicly accessible documentation; a /carriers endpoint and its response schema could not be confirmed without credentials.',
    },
    {
      resource: 'label',
      reason:
        'UNVERIFIED: The Trimble TMS next-gen REST API (api.trimble.com/tms/v1) is in pre-release beta with no publicly accessible documentation; a /labels endpoint and its response schema could not be confirmed without credentials.',
    },
    {
      resource: 'manifest',
      reason:
        'UNVERIFIED: The Trimble TMS next-gen REST API (api.trimble.com/tms/v1) is in pre-release beta with no publicly accessible documentation; a /manifests endpoint and its response schema could not be confirmed without credentials.',
    },
    {
      resource: 'order',
      reason:
        'UNVERIFIED: The Trimble TMS next-gen REST API (api.trimble.com/tms/v1) is in pre-release beta with no publicly accessible documentation; the Order module exists in the product but its REST endpoint paths and response schema could not be confirmed without credentials.',
    },
    {
      resource: 'warehouse',
      reason:
        'UNVERIFIED: The Trimble TMS next-gen REST API (api.trimble.com/tms/v1) is in pre-release beta with no publicly accessible documentation; a /warehouses endpoint and its response schema could not be confirmed without credentials.',
    },
  ],
} as const
