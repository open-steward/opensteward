export const metadata = {
  platform: 'mazrica',
  totalResources: 6,
  availableResources: ['activity', 'company', 'contact', 'deal', 'pipeline'],
  unavailableResources: [
    {
      resource: 'note',
      reason:
        'The Mazrica Open API v1 has no dedicated notes/memo endpoint; memo text is a sub-field on action (activity) objects only.',
    },
  ],
} as const
