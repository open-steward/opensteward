export const metadata = {
  platform: 'jotform-sign',
  totalResources: 5,
  availableResources: ['audit-trail-entry', 'envelope', 'signer'],
  unavailableResources: [
    {
      resource: 'document',
      reason:
        'Jotform Sign has no per-document metadata endpoint; the REST API (GET /form/{id}/files) only returns file-upload URLs from submissions, not the canonical Document fields (name, sizeBytes, pageCount, mimeType, order).',
    },
    {
      resource: 'template',
      reason:
        'Jotform Sign has no documented REST endpoint for templates; Jotform support has confirmed Sign API support is not yet available and there is no /sign/templates or equivalent path in the public API.',
    },
  ],
} as const
