export const metadata = {
  platform: 'salesforce-service',
  totalResources: 7,
  availableResources: ['contact', 'message', 'team', 'ticket', 'user'],
  unavailableResources: [
    {
      resource: 'macro',
      reason:
        'A Macro "is a set of instructions that tells the system to perform one or more tasks" (SELECT, SET, INSERT, SUBMIT steps), not a canned response, and the Macro object documents no body text',
    },
    {
      resource: 'tag',
      reason:
        'The Case object reference documents no tag field, and no canonical tag maps onto a Case field',
    },
  ],
} as const
