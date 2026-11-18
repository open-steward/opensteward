export const metadata = {
  platform: 'webcargo',
  totalResources: 8,
  availableResources: ['shipment', 'trackingevent'],
  unavailableResources: [
    { resource: 'carrier', reason: 'UNVERIFIED: API docs require authentication at developers.freightos.com; no public /carriers endpoint confirmed' },
    { resource: 'label', reason: 'WebCargo is an air/ocean freight booking platform that generates eAWBs, not parcel shipping labels; no label resource exists' },
    { resource: 'manifest', reason: 'UNVERIFIED: API docs require authentication at developers.freightos.com; no public /manifests endpoint confirmed' },
    { resource: 'order', reason: 'UNVERIFIED: API docs require authentication at developers.freightos.com; no public /orders endpoint confirmed' },
    { resource: 'rate', reason: 'UNVERIFIED: Rate quoting is a core WebCargo feature but endpoint path and response fields are behind authenticated developer portal' },
    { resource: 'warehouse', reason: 'WebCargo is a freight rate and booking platform with no warehouse management concept; no warehouse resource documented anywhere' },
  ],
} as const
