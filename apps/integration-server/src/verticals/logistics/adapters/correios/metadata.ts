export const metadata = {
  platform: 'correios',
  totalResources: 8,
  availableResources: ['rate', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason: 'Correios is the sole carrier; no carrier-listing endpoint exists in the public REST API',
    },
    {
      resource: 'label',
      reason: 'UNVERIFIED: prepostagem/v1 label endpoint confirmed to exist but full spec is behind CWS authenticated contract portal',
    },
    {
      resource: 'manifest',
      reason: 'UNVERIFIED: PPN manifest/PLP REST endpoint referenced but full spec is behind CWS authenticated contract portal',
    },
    {
      resource: 'order',
      reason: 'Correios is a carrier, not an order management system; no order API exists',
    },
    {
      resource: 'shipment',
      reason: 'UNVERIFIED: prepostagem/v1 shipment creation endpoint confirmed to exist but full spec is behind CWS authenticated contract portal',
    },
    {
      resource: 'warehouse',
      reason: 'Correios has no warehouse concept; agencia/v1/unidades returns branch offices, not warehouses',
    },
  ],
} as const
