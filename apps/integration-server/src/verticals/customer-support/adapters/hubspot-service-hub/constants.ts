/**
 * HubSpot Service Hub API constants.
 *
 * All CRM endpoints use https://api.hubapi.com as the base URL.
 * OAuth2 Authorization Code flow; access tokens expire in 30 minutes.
 */
export const API_BASE_URL = 'https://api.hubapi.com'

export const OAUTH_AUTHORIZE_URL = 'https://app.hubspot.com/oauth/authorize'
export const OAUTH_TOKEN_URL = 'https://api.hubapi.com/oauth/v1/token'

export const DEFAULT_PAGE_SIZE = 100

/**
 * HubSpot's ceiling on `limit` for the CRM v3 list endpoints. The CRM object
 * guide: "To retrieve a specific number of records under 100, add a value to
 * the limit parameter." Above it the API answers 400 VALIDATION_ERROR ("You
 * can only request at most 100 objects in one request."). Owners (spec default
 * 100) and every other list here are sent no more than this either.
 */
export const MAX_PAGE_SIZE = 100

/**
 * Upstream page size for the Conversations lists that listMessages walks
 * (threads by ticket, then each thread's messages). The conversations guide
 * caps threads: "The maximum limit is 500." The messages history documents
 * `limit` ("The maximum number of results to display per page.") with no
 * maximum, so both are sent this adapter's 100 ceiling. listMessages cuts the
 * caller's pages out of these with pageByRows, so this size never has to
 * match the caller's limit.
 */
export const CONVERSATIONS_PAGE_SIZE = MAX_PAGE_SIZE

/**
 * HubSpot's standard object type ID for the Tickets object.
 * The CRM Object Tags API (GET /crm/object-tags/2026-09/{objectTypeId}/{tagId})
 * takes objectTypeId as a path parameter; this adapter only surfaces tags for
 * tickets, so it is a fixed value rather than something derived per-call.
 */
export const TICKETS_OBJECT_TYPE_ID = '0-5'

/**
 * Minimum scopes required for read-only Service Hub integration.
 * tickets: list/get tickets, contacts: list/get contacts,
 * owners: list agents, conversations: read thread messages.
 */
export const DEFAULT_SCOPES = [
  'crm.objects.tickets.read',
  'crm.objects.contacts.read',
  'crm.objects.owners.read',
  'conversations.read',
  'settings.users.teams.read',
]

/**
 * Default ticket properties to request from the CRM API.
 * HubSpot returns only a minimal set unless you specify properties.
 */
export const DEFAULT_TICKET_PROPERTIES = [
  'subject',
  'content',
  'hs_pipeline',
  'hs_pipeline_stage',
  'hs_ticket_priority',
  'hs_ticket_category',
  'hs_resolution',
  'hubspot_owner_id',
  'hs_primary_company_id',
  'source_type',
  'hs_ticket_id',
  'createdate',
  'hs_lastmodifieddate',
  'hs_closed_at',
  'hs_num_associated_contacts',
  'notes_last_updated',
  'hs_tags',
].join(',')

/** Default contact properties to request. */
export const DEFAULT_CONTACT_PROPERTIES = [
  'email',
  'firstname',
  'lastname',
  'phone',
  'associatedcompanyid',
  'createdate',
  'lastmodifieddate',
].join(',')
