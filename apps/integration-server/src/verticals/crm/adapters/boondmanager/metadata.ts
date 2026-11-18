export const metadata = {
  platform: 'boondmanager',
  totalResources: 6,
  availableResources: ['activity', 'company', 'contact', 'deal', 'note'],
  unavailableResources: [
    {
      resource: 'pipeline',
      reason:
        'BoondManager has no /pipelines or /stages REST endpoint; opportunity progression is a flat integer state enum (AO_ETAT) with no configurable named-stage pipeline resource exposed via the public API.',
    },
  ],
} as const
