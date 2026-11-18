export const metadata = {
  platform: 'arcbest',
  totalResources: 8,
  availableResources: ['rate', 'shipment', 'trackingevent', 'carrier'],
  unavailableResources: [
    {
      resource: 'label',
      reason:
        'ArcBest has no label generation or retrieval endpoint in its public API; label printing is handled via the web portal',
    },
    {
      resource: 'manifest',
      reason:
        'ArcBest has no manifest or end-of-day close-out concept in its API; shipments are submitted individually via pickup-request',
    },
    {
      resource: 'order',
      reason:
        'ArcBest has no order management endpoints; its API covers rate quotes, pickup requests, tracking, and document retrieval only',
    },
    {
      resource: 'warehouse',
      reason:
        'ArcBest has no warehouse management endpoints in its public API',
    },
  ],
} as const
