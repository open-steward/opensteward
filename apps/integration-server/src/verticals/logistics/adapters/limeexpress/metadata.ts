export const metadata = {
  platform: 'limeexpress',
  totalResources: 8,
  availableResources: ['shipment', 'trackingevent'],
  unavailableResources: [
    { resource: 'carrier', reason: 'UNVERIFIED: API docs are behind authentication / api.limeexpress.com is not publicly reachable; no carrier endpoint confirmed' },
    { resource: 'label', reason: 'UNVERIFIED: API docs are behind authentication / api.limeexpress.com is not publicly reachable; no label endpoint confirmed' },
    { resource: 'manifest', reason: 'UNVERIFIED: API docs are behind authentication / api.limeexpress.com is not publicly reachable; no manifest endpoint confirmed' },
    { resource: 'order', reason: 'UNVERIFIED: API docs are behind authentication / api.limeexpress.com is not publicly reachable; no order endpoint confirmed' },
    { resource: 'rate', reason: 'UNVERIFIED: API docs are behind authentication / api.limeexpress.com is not publicly reachable; no rate endpoint confirmed' },
    { resource: 'warehouse', reason: 'UNVERIFIED: API docs are behind authentication / api.limeexpress.com is not publicly reachable; no warehouse endpoint confirmed' },
  ],
} as const
