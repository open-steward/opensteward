export const metadata = {
  platform: 'catalyst',
  totalResources: 6,
  availableResources: ['contact', 'company'],
  unavailableResources: [
    {
      resource: 'deal',
      reason:
        'Catalyst is a customer success platform; deal/opportunity pipeline management is not exposed in the external API v1.',
    },
    {
      resource: 'pipeline',
      reason:
        'Catalyst is a customer success platform; no pipeline configuration endpoint exists in the external API v1.',
    },
    {
      resource: 'note',
      reason:
        'UNVERIFIED: Search snippets confirm a notes endpoint exists in API v1, but help.catalyst.io returns HTTP 403 on all pages; exact endpoint path and response field names could not be confirmed.',
    },
    {
      resource: 'activity',
      reason:
        'UNVERIFIED: Search snippets confirm a tasks/activity endpoint exists in API v1, but help.catalyst.io returns HTTP 403 on all pages; exact endpoint path and response field names could not be confirmed.',
    },
  ],
} as const
