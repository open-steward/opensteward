export const metadata = {
  platform: 'libresign',
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
        'LibreSign has no template API — the platform manages documents as one-off signing requests and exposes no /template route or equivalent in its REST API (confirmed via official docs at libresign.github.io and the LibreSign/libresign controller listing).',
    },
  ],
} as const
