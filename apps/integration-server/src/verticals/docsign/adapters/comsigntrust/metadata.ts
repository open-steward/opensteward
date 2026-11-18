export const metadata = {
  platform: 'comsigntrust',
  totalResources: 5,
  availableResources: ['document', 'envelope', 'signer'],
  unavailableResources: [
    {
      resource: 'template',
      reason:
        'Not implemented. WeSign documents GET /v3/Templates ("Get all templates by search criteria", https://wse.comsigntrust.com/api/swagger/v3/swagger.json), so this is an adapter gap, not a platform one.',
    },
    {
      resource: 'audit-trail-entry',
      reason:
        'WeSign serves the trail only as a file ("Download document collection trace as separate file", GET /v3/DocumentCollections/{id}/audit/{offset}, response format: binary)',
    },
  ],
} as const
