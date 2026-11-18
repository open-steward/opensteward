export const metadata = {
  platform: 'clarify',
  totalResources: 6,
  availableResources: ['activity', 'company', 'contact', 'deal', 'note'],
  unavailableResources: [
    {
      resource: 'pipeline',
      reason:
        'Clarify exposes no pipeline or stage management endpoints in its public API (v1). The official docs list only person, company, deal, meeting, and task objects; pipeline/stage configuration is UI-only.',
    },
  ],
} as const
