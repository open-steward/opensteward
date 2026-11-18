export const metadata = {
  platform: 'pitt-ohio',
  totalResources: 8,
  availableResources: ['carrier', 'rate', 'trackingevent'],
  unavailableResources: [
    { resource: 'shipment', reason: 'UNVERIFIED: BOL/pickup API documented to exist but PDF docs are access-controlled; v1 endpoint path and response field names unconfirmed' },
    { resource: 'label', reason: 'UNVERIFIED: label creation documented as part of BOL API but field names unconfirmed; PDF docs behind HTTP 403' },
    { resource: 'manifest', reason: 'PITT OHIO LTL has no manifest management API; the BOL is the terminal shipping document' },
    { resource: 'order', reason: 'PITT OHIO is a carrier, not an order management system; no order concept exists' },
    { resource: 'warehouse', reason: 'PITT OHIO is a carrier, not a WMS; no warehouse API exists' },
  ],
} as const
