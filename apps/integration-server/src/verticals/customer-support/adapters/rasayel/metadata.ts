export const metadata = {
  platform: 'rasayel',
  totalResources: 7,
  availableResources: ['contact', 'macro', 'message', 'tag', 'team', 'ticket', 'user'],
  unavailableResources: [] as Array<{ resource: string; reason: string }>,
} as const
