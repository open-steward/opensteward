export const metadata = {
  platform: 'reply-bird-conversations',
  totalResources: 7,
  availableResources: [
    'contact',
    'macro',
    'message',
    'tag',
    'team',
    'ticket',
    'user',
  ],
  unavailableResources: [] as { resource: string; reason: string }[],
} as const
