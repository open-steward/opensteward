export const metadata = {
  platform: 'tribe-crm',
  totalResources: 6,
  availableResources: ['activity', 'company', 'contact', 'deal', 'note'],
  unavailableResources: [
    {
      resource: 'pipeline',
      reason:
        'Tribe CRM has no standalone pipeline OData entity set; pipeline context (PipelineId, Phase, PhaseId) is embedded on Activity_SalesOpportunity records and pipelines are configured only through the UI.',
    },
  ],
} as const
