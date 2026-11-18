/**
 * Planview AdaptiveWork (formerly Clarizen) REST API v2.0 constants.
 *
 * AdaptiveWork is multi-data-center: every organization's data lives in a
 * specific data center (e.g. `api2.clarizen.com`). The connection flow is:
 *   1. POST {userName, password} to the login server's `getServerDefinition`
 *      to discover the org's data-center origin (`serverLocation`).
 *   2. POST {userName, password} to that data center's `authentication/login`
 *      to receive a `sessionId` (plus `userId` / `organizationId`).
 *   3. Send every subsequent request with `Authorization: Session <sessionId>`.
 *
 * The per-connection data-center base URL is resolved at login time and stored
 * on `credentials.extra.baseUrl` (see `auth.ts` / `client.ts`). Sessions are
 * short-lived, so the username/password are also stored on `extra` and the
 * adapter re-logs-in transparently in `refreshCredentials`.
 *
 * Docs:
 *   https://success.planview.com/Planview_AdaptiveWork/API/REST_API_Guide_Version_2
 *   https://api.clarizen.com/V2.0/services/authentication/Login
 *   https://api.clarizen.com/V2.0/services/data/EntityQuery
 *   https://api.clarizen.com/V2.0/services/data/objects
 */

/**
 * The fixed login server. Used only to resolve the org's data center via
 * `authentication/getServerDefinition`; all data calls go to the returned
 * data-center origin.
 */
export const LOGIN_SERVER_URL = 'https://api.clarizen.com/V2.0/services'

/** Login server's data-center discovery endpoint. */
export const SERVER_DEFINITION_PATH = '/authentication/getServerDefinition'

/** Login endpoint (relative to whichever origin the request targets). */
export const LOGIN_PATH = '/authentication/login'

/** Where customers find their AdaptiveWork API credentials. */
export const TOKEN_HELP_URL =
  'https://success.planview.com/Planview_AdaptiveWork/API/REST_API_Guide_Version_2'

/**
 * EntityQuery is capped at 1000 rows per request server-side; 200 is a polite
 * default page size for the canonical read paths.
 */
export const DEFAULT_PAGE_SIZE = 200

/**
 * Field lists requested from EntityQuery / objects. AdaptiveWork returns only
 * `id` unless `fields` is supplied, so the adapter asks for the
 * canonical-relevant fields explicitly. Reference fields are dot-expanded
 * (`Manager.Name`) so the canonical transform can read names without a second
 * round-trip.
 */
export const PROJECT_FIELDS = [
  'Name',
  'Description',
  'State',
  'StartDate',
  'DueDate',
  'Manager.Name',
  'CreatedOn',
  'LastUpdatedOn',
] as const

export const TASK_FIELDS = [
  'Name',
  'Description',
  'State',
  'PercentCompleted',
  'Priority',
  'DueDate',
  'WorkItemType',
  'Project.Name',
  'Parent.Name',
  'Manager.Name',
  'CreatedOn',
  'LastUpdatedOn',
] as const

export const USER_FIELDS = [
  'FirstName',
  'LastName',
  'Email',
  'UserName',
  'State',
  'CreatedOn',
  'LastUpdatedOn',
] as const

export const DISCUSSION_FIELDS = [
  'Text',
  'CreatedBy.Name',
  'Container.Name',
  'CreatedOn',
  'LastUpdatedOn',
] as const

export const ORGANIZATION_FIELDS = ['Name', 'CreatedOn', 'LastUpdatedOn'] as const
