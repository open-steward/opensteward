/**
 * Top-level listables for background sync. Messages are scoped to a ticket
 * and fan out from listTickets; not enumerated here.
 */
export const LISTABLE_RESOURCES: Array<{ resourceType: string; method: string }> = [
  { resourceType: 'tickets', method: 'listTickets' },
  { resourceType: 'contacts', method: 'listContacts' },
  { resourceType: 'users', method: 'listUsers' },
  { resourceType: 'tags', method: 'listTags' },
  { resourceType: 'teams', method: 'listTeams' },
  { resourceType: 'macros', method: 'listMacros' },
]
