/**
 * Five9 API constants.
 *
 * Five9 exposes two JSON REST surfaces:
 *   - SCIM 2.0 at https://api.five9.com/scim/v2 — user/agent provisioning
 *     (authenticated with a long-lived Bearer token generated in the
 *     Five9 Admin console under Admin > Identity > SCIM Settings)
 *   - Agent/Supervisor REST at https://app.five9.com/appsvcs/rs/svc
 *     (session-based cookie auth; not suitable for server-side API-key integration)
 *
 * We use the SCIM surface because it accepts a static Bearer token (api_key)
 * and returns JSON for Users (agents/contacts) and Groups (skill-groups/teams).
 *
 * Tickets, messages, tags, and macros are only accessible via the SOAP
 * Configuration Web Services API — those resources are not implemented here.
 */

/** Base URL for the Five9 SCIM 2.0 REST API */
export const SCIM_BASE_URL = 'https://api.five9.com/scim/v2'

/** SCIM default page size (Five9 SCIM default is 10; we request up to 100 per page) */
export const DEFAULT_PAGE_SIZE = 100
