export const metadata = {
  platform: 'pega-crm',
  totalResources: 6,
  availableResources: ['activity', 'company', 'contact', 'deal', 'note'],
  unavailableResources: [
    {
      resource: 'pipeline',
      reason:
        'Pega Sales Automation stages are configuration-defined rule sets, not a REST-queryable resource. The Pega API v1 RAML spec (github.com/pegasystems/pega-api) exposes no /pipelines or /stages endpoint; stages live in the Pega rule repository and cannot be listed via the standard prweb/api/v1 surface.',
    },
  ],
} as const
