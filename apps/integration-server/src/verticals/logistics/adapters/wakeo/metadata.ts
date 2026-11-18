export const metadata = {
  platform: 'wakeo',
  totalResources: 8,
  availableResources: ['shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'UNVERIFIED: Wakeo API docs are behind a password-protected portal (ECONNREFUSED on public URL). Wakeo is a supply chain visibility platform with no publicly documented carrier-management endpoints.',
    },
    {
      resource: 'label',
      reason:
        'UNVERIFIED: Wakeo API docs are behind a password-protected portal. Wakeo is a visibility/tracking platform and does not offer label generation; no mention of label endpoints anywhere in public documentation.',
    },
    {
      resource: 'manifest',
      reason:
        'UNVERIFIED: Wakeo API docs are behind a password-protected portal. Wakeo is a visibility/tracking platform and does not offer manifest creation; no mention of manifest endpoints anywhere in public documentation.',
    },
    {
      resource: 'order',
      reason:
        'UNVERIFIED: Wakeo API docs are behind a password-protected portal. Wakeo ingests transport orders from TMS/ERP systems but does not expose an order-management API; no publicly documented order endpoints.',
    },
    {
      resource: 'rate',
      reason:
        'UNVERIFIED: Wakeo API docs are behind a password-protected portal. Wakeo is a visibility/tracking platform and does not offer rate shopping; no mention of rate endpoints anywhere in public documentation.',
    },
    {
      resource: 'warehouse',
      reason:
        'UNVERIFIED: Wakeo API docs are behind a password-protected portal. Wakeo is a visibility/tracking platform and does not offer warehouse management; no mention of warehouse endpoints anywhere in public documentation.',
    },
  ],
} as const
