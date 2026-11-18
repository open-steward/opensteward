export const metadata = {
  platform: 'portcast',
  totalResources: 8,
  availableResources: ['trackingevent', 'shipment'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'UNVERIFIED: Portcast docs reference a supported-carrier SCAC list but the exact REST endpoint path and response schema are behind authentication on Stoplight; cannot confirm field names without access.',
    },
    {
      resource: 'label',
      reason:
        'Portcast is an ocean-container visibility platform; it does not generate or manage shipping labels.',
    },
    {
      resource: 'manifest',
      reason:
        'Portcast is an ocean-container visibility platform; it has no manifest creation or submission concept.',
    },
    {
      resource: 'order',
      reason:
        'Portcast is an ocean-container visibility platform; it is not an order-management system and has no order endpoints.',
    },
    {
      resource: 'rate',
      reason:
        'Portcast is an ocean-container visibility platform; it does not provide freight rate shopping or quote endpoints.',
    },
    {
      resource: 'warehouse',
      reason:
        'Portcast is an ocean-container visibility platform; it has no warehouse management or warehouse endpoints.',
    },
  ],
} as const
