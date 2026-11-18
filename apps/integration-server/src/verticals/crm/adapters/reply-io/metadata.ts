export const metadata = {
  platform: 'reply-io',
  totalResources: 6,
  availableResources: ['company', 'contact', 'activity'],
  unavailableResources: [
    {
      resource: 'deal',
      reason: 'Reply.io is a sales engagement platform with no deal/opportunity concept; no /deals endpoint exists in the v3 API.',
    },
    {
      resource: 'pipeline',
      reason: 'No pipeline endpoint exists; Reply.io uses Sequences for outreach workflows, not deal pipelines.',
    },
    {
      resource: 'note',
      reason: 'No notes endpoint exists in the Reply.io v3 API.',
    },
  ],
} as const
