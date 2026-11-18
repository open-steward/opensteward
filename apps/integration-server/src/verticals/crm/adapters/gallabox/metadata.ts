export const metadata = {
  platform: 'gallabox',
  totalResources: 6,
  availableResources: ['activity', 'company', 'contact', 'deal', 'note'],
  unavailableResources: [
    {
      resource: 'pipeline',
      reason:
        'Gallabox is a WhatsApp-first messaging platform; its REST API exposes only Contacts, Conversations, Messages, Templates, Users, and Webhooks — no pipeline or deal-stage concept exists.',
    },
  ],
} as const
