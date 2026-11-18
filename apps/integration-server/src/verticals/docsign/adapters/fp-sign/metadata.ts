export const metadata = {
  platform: 'fp-sign',
  totalResources: 5,
  availableResources: [
    'audit-trail-entry',
    'document',
    'envelope',
    'signer',
    'template',
  ],
  unavailableResources: [] as { resource: string; reason: string }[],
} as const
