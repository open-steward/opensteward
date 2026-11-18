export const metadata = {
  platform: 'ets-express',
  totalResources: 8,
  availableResources: ['shipment', 'trackingevent'],
  unavailableResources: [
    { resource: 'carrier', reason: 'UNVERIFIED: ETS Express API docs are behind authentication (portal.etsexpress.com requires login; api.etsexpress.com/v1 is unreachable); no public endpoint confirmed' },
    { resource: 'label', reason: 'UNVERIFIED: ETS Express API docs are behind authentication (portal.etsexpress.com requires login; api.etsexpress.com/v1 is unreachable); no public endpoint confirmed' },
    { resource: 'manifest', reason: 'UNVERIFIED: ETS Express API docs are behind authentication (portal.etsexpress.com requires login; api.etsexpress.com/v1 is unreachable); no public endpoint confirmed' },
    { resource: 'order', reason: 'UNVERIFIED: ETS Express API docs are behind authentication (portal.etsexpress.com requires login; api.etsexpress.com/v1 is unreachable); no public endpoint confirmed' },
    { resource: 'rate', reason: 'UNVERIFIED: ETS Express API docs are behind authentication (portal.etsexpress.com requires login; api.etsexpress.com/v1 is unreachable); no public endpoint confirmed' },
    { resource: 'warehouse', reason: 'UNVERIFIED: ETS Express API docs are behind authentication (portal.etsexpress.com requires login; api.etsexpress.com/v1 is unreachable); no public endpoint confirmed' },
  ],
} as const
