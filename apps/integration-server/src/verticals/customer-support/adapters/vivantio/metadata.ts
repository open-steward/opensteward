export const metadata = {
  platform: 'vivantio',
  totalResources: 7,
  availableResources: ['contact', 'message', 'team', 'ticket', 'user'],
  unavailableResources: [
    {
      resource: 'macro',
      reason:
        'Vivantio has no canned-response / macro concept; confirmed absent from the full API endpoint listing at webservices-na01.vivantio.com/Help',
    },
    {
      resource: 'tag',
      reason:
        'Vivantio has no tag/label concept; confirmed absent from the full API endpoint listing at webservices-na01.vivantio.com/Help',
    },
  ],
} as const
