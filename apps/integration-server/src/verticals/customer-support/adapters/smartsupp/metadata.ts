export const metadata = {
  platform: 'smartsupp',
  totalResources: 7,
  availableResources: ['contact', 'message', 'tag', 'ticket', 'user'],
  unavailableResources: [
    {
      resource: 'macro',
      reason:
        'Smartsupp has no macros/canned-response REST API endpoint; shortcuts are UI-only and not exposed in the v2 OpenAPI spec.',
    },
    {
      resource: 'team',
      reason:
        'Smartsupp has no teams/groups REST API endpoint; groups are UI-only routing rules with no v2 API representation.',
    },
  ],
} as const
