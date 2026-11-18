export const metadata = {
  platform: 'accelo',
  totalResources: 6,
  availableResources: ['activity', 'company', 'contact', 'deal', 'note', 'pipeline'],
  unavailableResources: [] as { resource: string; reason: string }[],
} as const
