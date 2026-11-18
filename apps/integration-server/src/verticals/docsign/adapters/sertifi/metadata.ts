export const metadata = {
  platform: 'sertifi',
  totalResources: 5,
  availableResources: ['envelope', 'signer', 'document'],
  unavailableResources: [
    {
      resource: 'audit-trail-entry',
      reason:
        'The only activity endpoint (GET /v1.1/{folderId}/summary) returns a rendered PDF certificate, not a structured JSON activity feed; no per-event audit trail endpoint exists in the Sertifi REST API.',
    },
    {
      resource: 'template',
      reason:
        'Sertifi has a document library (UI-only), but exposes no REST endpoint to list or retrieve library items as templates; the only library interaction is referencing a libraryId when creating a document inside a folder.',
    },
  ],
} as const
