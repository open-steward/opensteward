export const metadata = {
  platform: 'certinal',
  totalResources: 5,
  availableResources: [
    'audit-trail-entry',
    'document',
    'envelope',
    'signer',
  ],
  unavailableResources: [
    {
      resource: 'template',
      reason:
        'Certinal API exposes no list-template or get-template endpoint; the only template operation is "Create Transaction Using Template" (write-only, consumes a templateId). Confirmed via the full published API surface (Microsoft connector docs + Stoplight).',
    },
  ],
} as const
