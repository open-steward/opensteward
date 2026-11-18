export const metadata = {
  platform: 'lemlist',
  totalResources: 6,
  availableResources: ['activity', 'company', 'contact', 'note', 'pipeline'],
  unavailableResources: [
    {
      resource: 'deal',
      reason: 'lemlist is an email outreach platform with no deals or sales-opportunity concept',
    },
  ],
} as const
