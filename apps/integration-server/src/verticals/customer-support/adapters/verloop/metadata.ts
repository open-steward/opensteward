/**
 * Verloop adapter resource-coverage metadata.
 *
 * The Verloop public API consists of two surfaces:
 *   1. Campaign API  — POST /api/v1/Campaign/*  (templates + campaigns)
 *   2. WhatsApp Partner API — https://partners.verloop.io/api/v2/whatsapp/*
 *      (account/number management, template CRUD, analytics, send_message)
 *
 * Neither surface exposes contacts, users/agents, departments/teams, tags,
 * or per-conversation message history. Those concepts exist within the
 * Verloop dashboard UI but are not reachable via any documented REST endpoint.
 *
 * Docs:
 *   https://help.verloop.io/knowledge-base/verloop-campaign-api/
 *   https://help.verloop.io/knowledge-base/whatsapp-partner-apis/
 */
export const metadata = {
  platform: 'verloop',
  totalResources: 7,
  availableResources: ['ticket', 'macro'],
  unavailableResources: [
    {
      resource: 'contact',
      reason:
        'No contact-management endpoint exists in the Verloop Campaign API or WhatsApp Partner API; contacts are only accessible via the dashboard UI.',
    },
    {
      resource: 'message',
      reason:
        'No message-history retrieval endpoint exists; the Campaign API only triggers outbound messages (SendMessage) and does not expose per-conversation message records.',
    },
    {
      resource: 'tag',
      reason:
        'Tags are not exposed by any documented Verloop REST API endpoint.',
    },
    {
      resource: 'team',
      reason:
        'Teams/departments are not exposed by any documented Verloop REST API endpoint; setDepartment is a client-side widget-only call.',
    },
    {
      resource: 'user',
      reason:
        'Agent/user management is not exposed by any documented Verloop REST API endpoint.',
    },
  ],
} as const
