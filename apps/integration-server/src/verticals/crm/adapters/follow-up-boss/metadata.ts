export const metadata = {
  platform: 'follow-up-boss',
  totalResources: 6,
  availableResources: ['activity', 'contact', 'deal', 'note', 'pipeline'],
  unavailableResources: [
    {
      resource: 'company',
      reason:
        'Follow Up Boss has no first-class company/account resource; the API has no /companies or equivalent endpoint.',
    },
  ],
} as const
