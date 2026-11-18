export const metadata = {
  platform: 'insign',
  totalResources: 5,
  availableResources: ['envelope', 'signer', 'document'],
  unavailableResources: [
    {
      resource: 'audit-trail-entry',
      reason:
        'inSign exposes audit history exclusively as a binary PDF download (/get/audit/download); no endpoint returns structured, machine-parseable event records.',
    },
    {
      resource: 'template',
      reason:
        'UNVERIFIED: inSign\'s product includes a template feature (per FAQ), but no list/get template endpoints appear in any public API documentation (Postman collection, getting-started guide, or package registry); the live OpenAPI spec requires sandbox interaction to inspect.',
    },
  ],
} as const
