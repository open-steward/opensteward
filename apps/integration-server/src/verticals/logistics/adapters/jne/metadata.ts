export const metadata = {
  platform: 'jne',
  totalResources: 8,
  availableResources: ['shipment', 'trackingevent', 'rate'],
  unavailableResources: [
    { resource: 'carrier', reason: 'JNE is a single courier; no multi-carrier listing API exists' },
    { resource: 'label', reason: 'label URL is embedded in the shipment response; no standalone label endpoint documented' },
    { resource: 'manifest', reason: 'no manifest management endpoint documented in the JNE public API' },
    { resource: 'order', reason: 'JNE is a carrier, not an OMS; no order management API documented' },
    { resource: 'warehouse', reason: 'no warehouse management API documented for JNE' },
  ],
} as const
