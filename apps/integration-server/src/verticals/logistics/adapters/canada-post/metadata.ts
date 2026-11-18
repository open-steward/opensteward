export const metadata = {
  platform: 'canada-post',
  totalResources: 8,
  availableResources: [
    'shipment',
    'trackingevent',
    'rate',
    'manifest',
  ],
  unavailableResources: [
    {
      resource: 'carrier',
      reason: 'Canada Post is itself the sole carrier; the API exposes no endpoint to list carriers or services independently of a rating request',
    },
    {
      resource: 'label',
      reason: 'Labels are binary artifacts (PDF/ZPL) retrieved via a dynamic GET /ers/artifact/… href returned at shipment creation; there is no structured label list or get endpoint returning label metadata',
    },
    {
      resource: 'order',
      reason: 'Canada Post has no order-management concept or API endpoint',
    },
    {
      resource: 'warehouse',
      reason: 'Canada Post has no warehouse concept or API endpoint',
    },
  ],
} as const
