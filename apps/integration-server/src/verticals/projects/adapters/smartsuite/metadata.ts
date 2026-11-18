export const metadata = {
  platform: 'smartsuite',
  totalResources: 6,
  availableResources: ['comment', 'project', 'task', 'user', 'workspace'],
  unavailableResources: [
    {
      resource: 'tag',
      reason:
        'The REST API documents no tags endpoint (the sitemap has no tags page, and the Solution Data category lists only "Records 13 items Fields 6 items Comments 3 items Tables 4 items Solutions 6 items Views 2 items Webhooks 7 items")',
    },
  ],
} as const
