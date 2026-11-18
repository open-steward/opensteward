import { reportUpstreamPage, simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  RateRequestParams,
  QueryParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Order } from '../../schema/order'
import type { Label } from '../../schema/label'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { GophrClient } from './client'
import { GOPHR_DEFAULT_COUNT } from './constants'
import { transformShipment, type GophrShipment } from './transform/shipment'
import { transformRate, type GophrQuote } from './transform/rate'
import { transformOrder, type GophrJobListResponse, type GophrJobResponse } from './transform/order'
import { transformLabel, type GophrLabelResponse } from './transform/label'

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: carrier   — Gophr is a single-carrier platform; no carrier listing endpoint exists
// Unavailable: manifest  — No manifest concept or endpoint in Gophr's API
// Unavailable: warehouse — No warehouse concept or endpoint in Gophr's API

const SIMPLE_API_KEY_FORM = simpleApiKey()

/** The caller's 1-based page and exact limit as Gophr's `page` and `count`. */
function gophrPageQuery(params: QueryParams): { page: number; count: number } {
  const p = Number(params.page)
  const n = Number(params.limit)
  return {
    page: Number.isFinite(p) && p >= 1 ? Math.floor(p) : 1,
    count: Number.isFinite(n) && n >= 1 ? Math.floor(n) : GOPHR_DEFAULT_COUNT,
  }
}

/** Report the end from `links.next` (null on the last page) and the total from `meta.page.total`. */
function reportGophrPage(params: QueryParams, raw: GophrJobListResponse): void {
  const next = raw.links?.next
  const total = raw.meta?.page?.total
  reportUpstreamPage(params, {
    ...(raw.links && (next === null || typeof next === 'string') ? { hasMore: next !== null } : {}),
    ...(typeof total === 'number' ? { totalCount: total } : {}),
  })
}

export class GophrAdapter implements LogisticsAdapter {
  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'gophr'
  readonly version = '1'

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }
  async exchangeCode(code: string, _ru: string): Promise<Credentials> {
    return exchangeApiKey(code)
  }
  async refreshCredentials(c: Credentials): Promise<Credentials> {
    return doRefresh(c)
  }

  /**
   * Refused before any request. The old path, `commercial-api/get-status`, is
   * not in the V2 Commercial API index (https://developers.gophr.com/llms.txt),
   * and no documented read returns an event history: a delivery carries only
   * its current `status` (Field-Job-Status), with no timestamp.
   */
  async getTrackingEvents(
    _credentials: Credentials,
    _trackingNumber: string,
  ): Promise<TrackingEvent[]> {
    throw Object.assign(
      new Error(
        'Gophr cannot list tracking events: the V2 Commercial API documents no tracking-history endpoint; its Jobs and Deliveries expose only the current `status`',
      ),
      { statusCode: 501, code: 'NOT_SUPPORTED' },
    )
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new GophrClient(credentials)
    const raw = await client.post<GophrShipment>('commercial-api/confirm-order', {
      pickup_address: data.originAddress,
      delivery_address: data.destinationAddress,
      external_id: data.reference,
    })
    return transformShipment(raw)
  }

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new GophrClient(credentials)
    const raw = await client.post<GophrQuote>('commercial-api/get-a-quote', {
      pickup_address: params.originAddress,
      delivery_address: params.destinationAddress,
    })
    return [transformRate(raw)]
  }

  /**
   * GET /jobs (https://developers.gophr.com/reference/get-job.md), paged by
   * the documented `page` ("Page number of the required results.") and
   * `count` ("Number of items to be returned in the current page.", default
   * 15, no documented maximum). `include-finished=1` because "Only unfinished
   * jobs will be returned by default": without it a delivered job would drop
   * out of the collection. The end signal is `links.next`, "`null` if on the
   * last page", and `meta.page.total` is the total row count.
   */
  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const { page, count } = gophrPageQuery(params)
    const client = new GophrClient(credentials)
    const raw = await client.get<GophrJobListResponse>('jobs', {
      'include-finished': 1,
      page,
      count,
    })
    const jobs = raw.data?.jobs
    if (!Array.isArray(jobs)) throw new Error('Gophr List Jobs response has no data.jobs array')
    reportGophrPage(params, raw)
    return jobs.map(transformOrder)
  }

  /** GET /jobs/{job_id} (https://developers.gophr.com/reference/get-jobs-job_id.md), response `data`. */
  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new GophrClient(credentials)
    const raw = await client.get<GophrJobResponse>(`jobs/${encodeURIComponent(id)}`)
    if (!raw.data) throw new Error(`Gophr returned no job for ${id}`)
    return transformOrder(raw.data)
  }

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    const client = new GophrClient(credentials)
    const jobId = data.shipmentId ?? ''
    const deliveryId = data.id ?? ''
    const raw = await client.post<GophrLabelResponse>(
      `jobs/${jobId}/deliveries/${deliveryId}/label`,
      {},
    )
    return transformLabel(raw, jobId, deliveryId)
  }
}
