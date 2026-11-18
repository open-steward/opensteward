export const metadata = {
  platform: 'thena',
  totalResources: 7,
  availableResources: ['message', 'tag', 'team', 'ticket', 'user'],
  unavailableResources: [
    {
      resource: 'macro',
      reason: 'Thena has no canned-responses/macros REST API; snippets exist only as a product UI feature with no documented endpoint',
    },
    {
      resource: 'contact',
      reason:
        'The platform API documents only POST on /v1/accounts/contacts ("Create customer contact"), and the customer_contacts search collection is "(Contact support coming soon)"',
    },
  ],
} as const
