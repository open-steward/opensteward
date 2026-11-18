export const metadata = {
  platform: 'searates',
  totalResources: 8,
  availableResources: ['shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'SeaRates carrier data lives in the RMS API (rates.searates.com/api/v1/rates/dictionary/carriers), which requires a separate platform-token credential exchange incompatible with this adapter\'s simpleApiKey auth.',
    },
    {
      resource: 'label',
      reason:
        'SeaRates is an ocean-freight rate and tracking platform; no parcel label generation API is documented.',
    },
    {
      resource: 'manifest',
      reason: 'No manifest API is documented across any SeaRates API surface.',
    },
    {
      resource: 'order',
      reason:
        'The SeaRates Booking System API (rates.searates.com/api/v1/bookings) is scoped to freight bookings and requires a separate platform-token credential exchange incompatible with this adapter\'s simpleApiKey auth.',
    },
    {
      resource: 'rate',
      reason:
        'SeaRates rate data lives in the RMS API (rates.searates.com/api/v1/rates/index), which requires a separate platform-token credential exchange incompatible with this adapter\'s simpleApiKey auth.',
    },
    {
      resource: 'warehouse',
      reason: 'No warehouse management API is documented across any SeaRates API surface.',
    },
  ],
} as const
