export const metadata = {
  platform: 'sicepat',
  totalResources: 8,
  availableResources: ['shipment', 'trackingevent', 'rate'],
  unavailableResources: [
    { resource: 'carrier', reason: 'SiCepat is a single Indonesian courier; no multi-carrier listing API exists' },
    { resource: 'label', reason: 'label URL is embedded in the shipment response (label_url field); no standalone label endpoint documented in the SiCepat API' },
    { resource: 'manifest', reason: 'no manifest management endpoint documented in the publicly accessible SiCepat API' },
    { resource: 'order', reason: 'SiCepat is a carrier, not an OMS; no order management API documented' },
    { resource: 'warehouse', reason: 'no warehouse management API documented for SiCepat' },
  ],
} as const
