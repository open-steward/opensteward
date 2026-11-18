export const metadata = {
  platform: 'supportbench',
  totalResources: 7,
  availableResources: ['contact', 'message', 'tag', 'team', 'ticket', 'user'],
  unavailableResources: [
    {
      resource: 'macro',
      reason:
        'Supportbench has no REST API endpoint for macros/canned responses. The platform UI supports macros but they are not exposed via the public API (confirmed via https://supportbench.readme.io/llms.txt).',
    },
  ],
} as const
