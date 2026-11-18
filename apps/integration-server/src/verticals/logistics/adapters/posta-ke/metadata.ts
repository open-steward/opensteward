export const metadata = {
  platform: 'posta-ke',
  totalResources: 8,
  availableResources: ['trackingevent'],
  unavailableResources: [
    { resource: 'carrier', reason: 'UNVERIFIED: Posta Kenya API docs are not publicly available; no evidence of a carrier listing endpoint' },
    { resource: 'label', reason: 'UNVERIFIED: Posta Kenya API docs are not publicly available; label generation appears routed through third-party aggregators only' },
    { resource: 'manifest', reason: 'UNVERIFIED: Posta Kenya API docs are not publicly available; manifestation endpoints not confirmed on the direct API' },
    { resource: 'order', reason: 'UNVERIFIED: Posta Kenya API docs are not publicly available; no evidence of an orders endpoint on api.posta.co.ke' },
    { resource: 'rate', reason: 'UNVERIFIED: Posta Kenya API docs are not publicly available; third-party integration notes explicitly state rate-shopping is absent' },
    { resource: 'shipment', reason: 'UNVERIFIED: Posta Kenya API docs are not publicly available; no evidence of a shipment management endpoint on api.posta.co.ke' },
    { resource: 'warehouse', reason: 'UNVERIFIED: Posta Kenya API docs are not publicly available; third-party integration notes explicitly state warehouse management is absent' },
  ],
} as const
