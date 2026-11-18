/**
 * CIGO Tracker logistics adapter.
 *
 * CIGO Tracker is a last-mile delivery management platform that provides
 * real-time tracking, route optimisation, and proof-of-delivery features.
 * This adapter covers:
 *   - Jobs / shipments (list, get, create, cancel)
 *   - Orders (list, get, create, update, cancel — mapped from CIGO jobs)
 *   - Tracking events: refused, see getTrackingEvents
 *
 * Auth: HTTP Basic, Account ID as username and Auth Key as password
 * (Integrations > API).
 *
 * Webhooks: the spec documents an `X-Cigo-Tracker-Signature` header, a
 * base64 `HMAC SHA-256` of `account_id:JCS(payload):timestamp` with
 * `X-Cigo-Tracker-Timestamp`. This adapter has no webhook.ts verifier yet.
 *
 * Docs: https://app.cigotracker.com/api, which renders the OpenAPI 3.0 spec at
 * https://app.cigotracker.com/reference/cigo-swagger.json.
 */
// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: carrier   — CIGO Tracker manages internal drivers/operators, not third-party
//                          carrier integrations. No carriers endpoint exists.
// Unavailable: label     — No shipping label generation. Jobs carry a tracking_url only;
//                          no PDF/ZPL label endpoint exists.
// Unavailable: manifest  — No manifest/end-of-day concept or API endpoint. Itineraries
//                          are route plans, not carrier manifests.
// Unverified:  rate      — Not a rate-shopping platform; all public docs confirm only Jobs/
//                          Actions/Itineraries. Full API ref is behind authentication.
// Unverified:  warehouse — Depots are mentioned in the UI but no /depots or /warehouses
//                          endpoint is documented publicly; full API ref requires auth.
import { connectionScope, customForm, pageByRows, reportUpstreamPage } from '@opensteward/shared'
import type { LogisticsAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { Order } from '../../schema/order'
import type { TrackingEvent } from '../../schema/trackingevent'

import { buildAuthUrl, exchangeApiCredentials, refreshCredentials as doRefresh } from './auth'
import { CigoTrackerClient, cigoAccountId } from './client'
import { SEARCH_WINDOW_DAYS } from './constants'
import type { CigoJobResponse, CigoSearchJobsResponse } from './types'

import { transformShipment } from './transform/shipment'
import { transformOrder } from './transform/order'

// ── Connect Link credential form ──────────────────────────────────────────────

const CREDENTIAL_FORM = customForm({
  fields: [
    {
      name: 'accountId',
      label: 'API Account ID',
      type: 'text',
      required: true,
      helpText: 'Your CIGO Tracker API Account ID, found under Integrations > API Settings.',
    },
    {
      name: 'authKey',
      label: 'API Auth Key',
      type: 'password',
      required: true,
      helpText: 'Your CIGO Tracker API Auth Key, found alongside the Account ID.',
    },
  ],
  exchange: async (fields: Record<string, string>): Promise<Credentials> => {
    const accountId = (fields['accountId'] ?? '').trim()
    const authKey = (fields['authKey'] ?? '').trim()
    if (!accountId) throw new Error('API Account ID is required.')
    if (!authKey) throw new Error('API Auth Key is required.')
    return exchangeApiCredentials(accountId, authKey)
  },
})

// ── Listing jobs: date-windowed ID search, then one GET per ID ────────────────

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

const DAY_MS = 86_400_000

/**
 * Job-date windows for POST /jobs/search, from the UTC day of `updatedAfter`
 * to the current UTC day, each at most SEARCH_WINDOW_DAYS days. Days count
 * from the epoch; `topDay` is fixed within a UTC day, so page N of a walk is
 * the same rows while the windows hold the same jobs.
 */
interface DateWindows {
  lowerDay: number
  topDay: number
  count: number
}

function dateWindows(updatedAfter: Date): DateWindows | undefined {
  const lowerDay = Math.floor(updatedAfter.getTime() / DAY_MS)
  const topDay = Math.floor(Date.now() / DAY_MS)
  if (!(lowerDay <= topDay)) return undefined
  return { lowerDay, topDay, count: Math.ceil((topDay - lowerDay + 1) / SEARCH_WINDOW_DAYS) }
}

function isoDay(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10)
}

/** The search body of window `index`, NEWEST first: window 0 ends today. */
function windowAt(w: DateWindows, index: number): { start_date: string; end_date: string } {
  const to = w.topDay - index * SEARCH_WINDOW_DAYS
  const from = Math.max(to - (SEARCH_WINDOW_DAYS - 1), w.lowerDay)
  return { start_date: isoDay(from), end_date: isoDay(to) }
}

const LIST_REFUSAL =
  'POST /jobs/search, the only way to list jobs, requires "start_date" and searches ' +
  '"where the date is within a certain start and end range (within 30 days)", and CIGO ' +
  'documents no lookback limit. Pass updated_after to walk 30-day job-date windows from then to today.'

/**
 * The caller's page of job IDs. Each window is one POST /jobs/search, which
 * has no paging parameter and returns every matching ID, `in_staging.ids`
 * then `post_staging.ids`; `pageByRows` cuts the caller's rows out of those
 * windows and reports `hasMore` exactly.
 */
async function pageJobIds(
  client: CigoTrackerClient,
  credentials: Credentials,
  params: QueryParams,
  resource: string,
): Promise<string[]> {
  if (!params.updatedAfter) {
    throw notSupported(
      `CIGO Tracker cannot list ${resource} without updated_after: ${LIST_REFUSAL}`,
    )
  }
  const w = dateWindows(params.updatedAfter)
  if (!w) {
    reportUpstreamPage(params, { hasMore: false })
    return []
  }
  const scope = connectionScope(cigoAccountId(credentials), credentials)
  const key = `cigo-tracker:${scope}:jobs/search:${w.lowerDay}:${w.topDay}`
  const { items } = await pageByRows<string, number>(
    key,
    params,
    async (cursor) => {
      const at = cursor ?? 0
      const res = await client.post<CigoSearchJobsResponse>('/jobs/search', windowAt(w, at))
      const ids = [...(res.in_staging?.ids ?? []), ...(res.post_staging?.ids ?? [])]
      return { items: ids, next: at + 1 < w.count ? at + 1 : null }
    },
    // One upstream page per window, empty or not.
    { maxUpstreamPages: w.count + 1 },
  )
  return items
}

/**
 * "Retrieve a Job", `GET /jobs/id/{jobID}`, for each ID in order. A job the
 * search returned but that is gone by the time it is read (the documented
 * 404, "No Job found for given `jobID`.") is skipped, so one deletion
 * between the search and the read does not fail the whole page. Every other
 * error is thrown.
 */
async function fetchJobs(client: CigoTrackerClient, ids: string[]): Promise<CigoJobResponse[]> {
  const out: CigoJobResponse[] = []
  for (const id of ids) {
    try {
      out.push(await client.get<CigoJobResponse>(`/jobs/id/${encodeURIComponent(id)}`))
    } catch (err) {
      if ((err as { response?: { status?: number } }).response?.status === 404) continue
      throw err
    }
  }
  return out
}

/**
 * "Job Create Response" (POST /jobs) and "Update Job Response" (PATCH
 * /jobs/id/{jobID}) return the `job_id` and a `message`, not the job.
 */
interface CigoJobWriteResponse {
  job_id?: string
  [key: string]: unknown
}

function fromWriteResponse(raw: CigoJobWriteResponse): {
  id?: string
  metadata: Record<string, unknown>
} {
  return { id: typeof raw.job_id === 'string' ? raw.job_id : undefined, metadata: raw }
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class CigoTrackerAdapter implements LogisticsAdapter {
  readonly platform = 'cigo-tracker'
  readonly version = '1'

  credentialFields = CREDENTIAL_FORM.credentialFields
  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  // ── Auth ────────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // code expected as "accountId:authKey"
    const idx = code.indexOf(':')
    if (idx === -1) {
      throw new Error('CigoTracker exchangeCode expects code in the format "accountId:authKey"')
    }
    return exchangeApiCredentials(code.slice(0, idx), code.slice(idx + 1))
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Shipments (jobs) ────────────────────────────────────────────────────────

  /**
   * Jobs as shipments. The spec's `/jobs` path has only `post` ("Create a new
   * Job"); listing is "Search for Job API IDs", `POST /jobs/search`, which
   * returns IDs only, so each ID on the caller's page is then read with
   * "Retrieve a Job", `GET /jobs/id/{jobID}`. The search needs a job-date
   * range of at most 30 days and CIGO names no lookback limit, so a call
   * without `updatedAfter` is refused before any request. The windows filter
   * on the job's `date`, not on when it changed.
   */
  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new CigoTrackerClient(credentials)
    const ids = await pageJobIds(client, credentials, params, 'shipments')
    return (await fetchJobs(client, ids)).map(transformShipment)
  }

  /** "Retrieve a Job", `GET /jobs/id/{jobID}`, by the `job_id` listShipments returns. */
  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new CigoTrackerClient(credentials)
    const raw = await client.get<CigoJobResponse>(`/jobs/id/${encodeURIComponent(id)}`)
    return transformShipment(raw)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new CigoTrackerClient(credentials)
    const raw = await client.post<CigoJobWriteResponse>('/jobs', {
      reference_id: data.reference,
      notes: data.notes,
      skip_staging: true,
      origin: data.originAddress
        ? {
            full_name: data.originAddress.name,
            company: data.originAddress.company,
            address1: data.originAddress.street1,
            address2: data.originAddress.street2,
            city: data.originAddress.city,
            state: data.originAddress.state,
            postal_code: data.originAddress.postalCode,
            country: data.originAddress.country,
            phone: data.originAddress.phone,
            email: data.originAddress.email,
          }
        : undefined,
      destination: data.destinationAddress
        ? {
            full_name: data.destinationAddress.name,
            company: data.destinationAddress.company,
            address1: data.destinationAddress.street1,
            address2: data.destinationAddress.street2,
            city: data.destinationAddress.city,
            state: data.destinationAddress.state,
            postal_code: data.destinationAddress.postalCode,
            country: data.destinationAddress.country,
            phone: data.destinationAddress.phone,
            email: data.destinationAddress.email,
          }
        : undefined,
    })
    return fromWriteResponse(raw)
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new CigoTrackerClient(credentials)
    await client.post<unknown>(`/jobs/${encodeURIComponent(id)}/cancel`, {})
  }

  // ── Orders (jobs with customer / items context) ───────────────────────────

  /** Jobs as orders, over the same ID search and per-ID read as listShipments. */
  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new CigoTrackerClient(credentials)
    const ids = await pageJobIds(client, credentials, params, 'orders')
    return (await fetchJobs(client, ids)).map(transformOrder)
  }

  /** "Retrieve a Job", `GET /jobs/id/{jobID}`, by the `job_id` listOrders returns. */
  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new CigoTrackerClient(credentials)
    const raw = await client.get<CigoJobResponse>(`/jobs/id/${encodeURIComponent(id)}`)
    return transformOrder(raw)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new CigoTrackerClient(credentials)
    const raw = await client.post<CigoJobWriteResponse>('/jobs', {
      reference_id: data.orderNumber,
      notes: data.notes,
      skip_staging: true,
      destination: data.destinationAddress
        ? {
            full_name: data.destinationAddress.name,
            company: data.destinationAddress.company,
            address1: data.destinationAddress.street1,
            address2: data.destinationAddress.street2,
            city: data.destinationAddress.city,
            state: data.destinationAddress.state,
            postal_code: data.destinationAddress.postalCode,
            country: data.destinationAddress.country,
            phone: data.destinationAddress.phone,
            email: data.destinationAddress.email,
          }
        : undefined,
      origin: data.originAddress
        ? {
            full_name: data.originAddress.name,
            company: data.originAddress.company,
            address1: data.originAddress.street1,
            address2: data.originAddress.street2,
            city: data.originAddress.city,
            state: data.originAddress.state,
            postal_code: data.originAddress.postalCode,
            country: data.originAddress.country,
            phone: data.originAddress.phone,
            email: data.originAddress.email,
          }
        : undefined,
      items: data.lineItems?.map((li) => ({
        sku: li.sku,
        name: li.name,
        description: li.description,
        quantity: li.quantity,
        unit_price: li.unitAmount,
        total_price: li.totalAmount,
      })),
      currency: data.currency,
      total_amount: data.totalAmount,
    })
    return fromWriteResponse(raw)
  }

  async updateOrder(credentials: Credentials, id: string, data: Partial<Order>): Promise<Order> {
    const client = new CigoTrackerClient(credentials)
    const raw = await client.patch<CigoJobWriteResponse>(`/jobs/${encodeURIComponent(id)}`, {
      reference_id: data.orderNumber,
      notes: data.notes,
      destination: data.destinationAddress
        ? {
            full_name: data.destinationAddress.name,
            company: data.destinationAddress.company,
            address1: data.destinationAddress.street1,
            address2: data.destinationAddress.street2,
            city: data.destinationAddress.city,
            state: data.destinationAddress.state,
            postal_code: data.destinationAddress.postalCode,
            country: data.destinationAddress.country,
            phone: data.destinationAddress.phone,
            email: data.destinationAddress.email,
          }
        : undefined,
    })
    return fromWriteResponse(raw)
  }

  async cancelOrder(credentials: Credentials, id: string): Promise<void> {
    const client = new CigoTrackerClient(credentials)
    await client.post<unknown>(`/jobs/${encodeURIComponent(id)}/cancel`, {})
  }

  // ── Tracking Events ─────────────────────────────────────────────────────────

  /**
   * Refused before any request. "Retrieve a Job" carries the job's current
   * `status` only, not a history of it, and the only per-job event list,
   * "Retrieve all Job geofencing events" (`GET /geofencing/job_id/{job_id}`),
   * gives each event's `arrival` and `departure` as a time of day ("08:00:00
   * AM") with no date, so no event has a timestamp to report.
   */
  async getTrackingEvents(
    _credentials: Credentials,
    _trackingNumber: string,
  ): Promise<TrackingEvent[]> {
    throw notSupported(
      'CIGO Tracker cannot list tracking events: GET /jobs/id/{jobID} returns the current job ' +
        '"status" only, and GET /geofencing/job_id/{job_id} gives "arrival" and "departure" as ' +
        'times of day ("08:00:00 AM") with no date.',
    )
  }
}
