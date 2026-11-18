export const metadata = {
  platform: 'mekari-sign',
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
        'The Mekari Sign eSignature API exposes no template endpoints. The official SDK (esign-api-php) and public API reference cover documents, signing, stamping, and auto-sign only — no /templates route exists.',
    },
  ],
} as const
