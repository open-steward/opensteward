/**
 * Totango HTTP client.
 *
 * Authentication: app-token header on every request —
 *   "--header 'app-token:YOUR-TOKEN-HERE'" (Search API, Touchpoints API).
 *
 * Two base URLs are used:
 *   BASE_URL     — https://api.totango.com  (search / events / touchpoints)
 *   CDH_BASE_URL — https://int-hub.totango.com  (CDH ingest for accounts/users)
 *
 * References:
 *   https://support.totango.com/hc/en-us/articles/204174135-Search-API-accounts-and-users
 *   https://support.totango.com/hc/en-us/articles/360048132792-Search-API-events
 *   https://support.totango.com/hc/en-us/articles/115000597266-Touchpoints-API
 *   https://support.totango.com/hc/en-us/articles/360043441152-Customer-Data-Hub-API
 */

import type { Credentials } from '@opensteward/shared'
import { BASE_URL, CDH_BASE_URL } from './constants'

// ── Response shapes ────────────────────────────────────────────────────────────

/**
 * One hit of POST /api/v1/search/accounts, as the documented sample shows it:
 *   {"name":"19934", // account-id
 *    "display_name":"ACME Inc", //  account-name
 *    "last_activity_time":1421422240000,
 *    "selected_fields":[ // requested fields
 */
export interface TotangoAccountHit {
  name?: string
  display_name?: string
  last_activity_time?: number
  selected_fields?: unknown[]
  [key: string]: unknown
}

/**
 * One hit of POST /api/v1/search/users, as the documented sample shows it:
 *   "name":"moris@123.com", "display_name":"moris@123.com",
 *   "first_activity_time":1404296416000, "last_activity_time":1423058976000,
 *   "selected_fields":[1423058976000,1589]
 */
export interface TotangoUserHit {
  name?: string
  display_name?: string
  first_activity_time?: number
  last_activity_time?: number
  selected_fields?: unknown[]
  [key: string]: unknown
}

/**
 * Documented sample: {"response": {"status":"success", "stats":{"total_hits":158},
 * "accounts":{"hits":[...]}}}.
 */
export interface TotangoAccountSearchResponse {
  response?: {
    stats?: { total_hits?: number }
    accounts?: { hits?: TotangoAccountHit[] }
  }
}

/**
 * Documented sample (malformed JSON in the article):
 *   {"response":{"total_hits":2634}, ... "status":"success", "users":{"hits":[...]}}}}
 * One extra closing brace leaves `users` either inside `response` (like the
 * accounts sample) or beside it; `total_hits` sits in `response` either way.
 */
export interface TotangoUserSearchResponse {
  response?: { total_hits?: number; users?: { hits?: TotangoUserHit[] } }
  users?: { hits?: TotangoUserHit[] }
}

/**
 * One timeline event, as the Touchpoints API ("Retrieve events per account")
 * and Search API (events) samples show it.
 */
export interface RawTotangoEvent {
  id?: string
  timestamp?: number
  type?: string
  account?: { id?: string }
  is_new?: unknown
  note_content?: {
    text?: string
    totango_user?: { user_name?: string }
    note_id?: number
  }
  properties?: {
    subject?: string
    activity_type_id?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

/** Documented sample: {"response": {"events": {"hits": [...], "total": 5}}, "status": "success"}. */
export interface TotangoEventSearchResponse {
  response?: { events?: { hits?: RawTotangoEvent[]; total?: number } }
}

/** The JSON search query every Search API endpoint takes in its `query` form field. */
export type TotangoSearchQuery = Record<string, unknown>

// ── Internal helpers ───────────────────────────────────────────────────────────

async function request<T>(
  method: string,
  baseUrl: string,
  path: string,
  token: string,
  body?: unknown,
  isFormEncoded = false,
): Promise<T> {
  const headers: Record<string, string> = {
    'app-token': token,
  }

  let serialisedBody: string | undefined
  if (body != null) {
    if (isFormEncoded) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded'
      serialisedBody =
        typeof body === 'string'
          ? body
          : new URLSearchParams(body as Record<string, string>).toString()
    } else {
      headers['Content-Type'] = 'application/json'
      headers['Accept'] = 'application/json'
      serialisedBody = JSON.stringify(body)
    }
  } else {
    headers['Accept'] = 'application/json'
  }

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: serialisedBody,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(new Error(`Totango API error ${res.status}: ${text}`), {
      statusCode: res.status,
    })
  }

  if (res.status === 204) return undefined as unknown as T
  return res.json() as Promise<T>
}

// ── TotangoClient ──────────────────────────────────────────────────────────────

export class TotangoClient {
  private token: string

  constructor(credentials: Credentials) {
    this.token = credentials.accessToken
  }

  /** Every search endpoint's curl sends the JSON query as `--data 'query={...}'`. */
  private search<T>(path: string, query: TotangoSearchQuery): Promise<T> {
    const encoded = new URLSearchParams({ query: JSON.stringify(query) }).toString()
    return request<T>('POST', BASE_URL, path, this.token, encoded, true)
  }

  /** POST /api/v1/search/accounts — "To search for accounts matching certain criteria". */
  searchAccounts(query: TotangoSearchQuery): Promise<TotangoAccountSearchResponse> {
    return this.search('/api/v1/search/accounts', query)
  }

  /** POST /api/v1/search/users — "Search for users". */
  searchUsers(query: TotangoSearchQuery): Promise<TotangoUserSearchResponse> {
    return this.search('/api/v1/search/users', query)
  }

  /** POST /api/v2/events/search — "search any type of events in Totango". */
  searchEvents(query: TotangoSearchQuery): Promise<TotangoEventSearchResponse> {
    return this.search('/api/v2/events/search', query)
  }

  /** POST /api/v3/touchpoints — create a touchpoint (note) on an account. */
  createTouchpoint<T = unknown>(data: Record<string, unknown>): Promise<T> {
    const encoded = new URLSearchParams(
      Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]),
      ),
    ).toString()
    return request<T>('POST', BASE_URL, '/api/v3/touchpoints', this.token, encoded, true)
  }

  // ── CDH Ingest API (int-hub.totango.com) ───────────────────────────────────

  /**
   * POST /api/v1/accounts (CDH)
   * Upsert account and/or user attributes using the Customer Data Hub ingestion API.
   * Body is form-encoded with a `data` field containing a JSON string.
   */
  ingestAccounts<T = unknown>(payload: Record<string, unknown>): Promise<T> {
    const encoded = new URLSearchParams({ data: JSON.stringify(payload) }).toString()
    return request<T>('POST', CDH_BASE_URL, '/api/v1/accounts', this.token, encoded, true)
  }
}
