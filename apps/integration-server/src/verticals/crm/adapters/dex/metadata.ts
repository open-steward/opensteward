export const metadata = {
  platform: 'dex',
  totalResources: 6,
  availableResources: ['activity', 'contact', 'note'],
  unavailableResources: [
    {
      resource: 'company',
      reason:
        'Dex is a personal CRM focused on individual relationships; it has no company or organisation object in the API.',
    },
    {
      resource: 'deal',
      reason:
        'Dex is a personal CRM with no deal-tracking concept; confirmed by official docs and product description ("no pipeline, no deal tracking").',
    },
    {
      resource: 'pipeline',
      reason:
        'Dex is a personal CRM with no pipeline concept; confirmed by official docs and product description ("no pipeline, no deal tracking").',
    },
  ],
} as const
