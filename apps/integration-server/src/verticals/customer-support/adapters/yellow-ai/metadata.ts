export const metadata = {
  platform: 'yellow-ai',
  totalResources: 7,
  availableResources: ['contact', 'message', 'user'],
  unavailableResources: [
    {
      resource: 'macro',
      reason:
        "Yellow.ai's public REST API exposes no endpoint for canned responses / macros; the feature is UI-only and bulk API access is explicitly unsupported per docs.",
    },
    {
      resource: 'tag',
      reason:
        "Yellow.ai's public REST API exposes no endpoint for listing or retrieving tags; tag management is UI-only.",
    },
    {
      resource: 'team',
      reason:
        "Yellow.ai's public REST API exposes no endpoint for agent groups / teams; group management is UI-only.",
    },
    {
      resource: 'ticket',
      reason:
        'The Email Ticket list (GET /api/ticketing/ticket) "Fetches a paginated list of tickets created in the past 30 days" and documents only id, status and created_at per ticket (no subject, requester or channel); the Inbox Ticketing lists (GET /api/agents/public/v1/ticket/search, /views/{viewId}/tickets) document their tickets only as "items": { "type": "object" }',
    },
  ],
} as const
