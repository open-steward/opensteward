export const metadata = {
  platform: 'viafirma',
  totalResources: 5,
  availableResources: ['document', 'envelope', 'signer', 'template'],
  unavailableResources: [
    {
      resource: 'audit-trail-entry',
      reason:
        'The Viafirma Documents API exposes audit-trail data only as a PDF download link ' +
        '(GET /documents/api/v3/download/trail/{messageCode} → {link, fileName, expires}). ' +
        'There is no endpoint that returns structured, queryable audit-trail event records.',
    },
  ],
} as const
