/**
 * InvGate Service Management — API constants.
 *
 * The API is tenant-hosted. The base URL is built from the customer's
 * instance hostname stored in credentials.extra.instanceHost, e.g.
 * "acme.cloud.invgate.net" -> "https://acme.cloud.invgate.net".
 *
 * Docs: https://releases.invgate.com/service-desk/api/
 */

/** Placeholder used when no per-tenant host is available (overridden at runtime). */
export const API_BASE_URL_TEMPLATE = 'https://{instanceHost}'

/** Default items per page for paginated listing endpoints. */
export const DEFAULT_PAGE_SIZE = 100

/** Maximum items per page accepted by InvGate (categories, users). */
export const MAX_PAGE_SIZE = 500

/**
 * Canonical status_id -> name mapping.
 * Callers should prefer /incident.attributes.status for live values;
 * this map is used as a fallback for the common defaults.
 */
export const STATUS_ID_MAP: Record<number, string> = {
  1: 'open',
  2: 'closed',
  3: 'pending',
  4: 'on_hold',
}

/**
 * priority_id -> canonical name mapping.
 * 1=Low 2=Medium/Normal 3=High 4=Urgent 5=Critical
 */
export const PRIORITY_ID_MAP: Record<number, string> = {
  1: 'low',
  2: 'normal',
  3: 'high',
  4: 'urgent',
  5: 'urgent', // critical → urgent (no higher canonical bucket)
}
