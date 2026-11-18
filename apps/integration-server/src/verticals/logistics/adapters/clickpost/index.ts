import {
  connectionScope,
  customForm,
  pageByRows,
  pageLocally,
  reportUpstreamPage,
} from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
  RateRequestParams,
} from '../../adapter/interface'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Shipment } from '../../schema/shipment'
import type { Order } from '../../schema/order'
import type { Carrier } from '../../schema/carrier'
import type { Rate } from '../../schema/rate'
import type { Label } from '../../schema/label'
import type { Manifest } from '../../schema/manifest'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { ClickPostClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import {
  transformTrackingResult,
  type ClickPostTrackingResult,
} from './transform/tracking'
import { transformManifest, type ClickPostManifest } from './transform/manifest'
import { transformOrderResult, type ClickPostOrderResult } from './transform/shipment'
import { transformUpdatedOrder, type ClickPostUpdatedOrder } from './transform/updated-order'
import { transformCarriers, type ClickPostAccount } from './transform/carrier'
import { transformOrder, type ClickPostOrderDetail } from './transform/order'
import { transformRate, type ClickPostRecommendation } from './transform/rate'
import { transformLabel, type ClickPostLabelResponse } from './transform/label'

// ── Response envelope types ────────────────────────────────────────────────────

interface ClickPostMeta {
  message: string
  status: number
  success: boolean
}

interface ClickPostListResponse<T> {
  meta: ClickPostMeta
  result: T[]
}

interface ClickPostSingleResponse<T> {
  meta: ClickPostMeta
  result: T
}

interface ClickPostTrackingResponse {
  meta: ClickPostMeta
  result: ClickPostTrackingResult
}

interface ClickPostRecommendationResponse {
  meta: ClickPostMeta
  result: {
    preference: ClickPostRecommendation[]
  }
}

interface ClickPostFetchAccountsResult {
  enterprise_name?: string
  accounts?: ClickPostAccount[]
}

/** "Difference between start time and end time cannot be greater than 1800 seconds(30 mins)" */
const UPDATED_ORDER_WINDOW_SECONDS = 1800

/**
 * ClickPost answers errors with a `meta` block ("success: Whether the request
 * is successful or not"), not always with an HTTP error status: an invalid key
 * comes back as `{"meta":{"status":301,"message":"Authentication Failed: ...",
 * "success":false}}`. Reading such a body as an empty result would pass a
 * failed call off as an empty collection.
 */
function assertSuccess(meta: ClickPostMeta | undefined): void {
  if (meta && meta.success === false) {
    throw Object.assign(new Error(`ClickPost error ${meta.status}: ${meta.message}`), {
      statusCode: 502,
      upstreamStatus: meta.status,
    })
  }
}

/** The account the connection belongs to, for pager keys. */
function clickPostUsername(credentials: Credentials): string {
  const username = (credentials.extra as Record<string, unknown> | undefined)?.['username']
  return typeof username === 'string' ? username : ''
}

// ── Resource coverage ──────────────────────────────────────────────────────────
// Unavailable: warehouse — ClickPost has no dedicated warehouse management
//              endpoint; pickup location data exists only as embedded fields
//              (vendor_code, from_wh, pickup_type) within order creation payloads.

// ── Adapter config ─────────────────────────────────────────────────────────────

interface ClickPostAdapterConfig {
  clientId?: string
  clientSecret?: string
  redirectUri?: string
  scopes?: string[]
}

/**
 * ClickPost requires both an API key and a username for mutations.
 * We expose a two-field Connect Link form; both values are stored
 * in credentials (accessToken = key, extra.username = username).
 */
const CLICKPOST_FORM = customForm({
  fields: [
    {
      name: 'apiKey',
      label: 'API key',
      type: 'password',
      required: true,
      helpText: 'Found in your ClickPost account settings.',
    },
    {
      name: 'username',
      label: 'Username',
      type: 'text',
      required: true,
      helpText: 'Your ClickPost account username (email or handle).',
    },
  ],
  async exchange(input: Record<string, string>): Promise<Credentials> {
    const apiKey = (input['apiKey'] ?? '').trim()
    const username = (input['username'] ?? '').trim()
    if (!apiKey) throw new Error('API key is required.')
    if (!username) throw new Error('Username is required.')
    return exchangeApiKey(apiKey, username)
  },
})

// ── Adapter ────────────────────────────────────────────────────────────────────

export class ClickPostAdapter implements LogisticsAdapter {
  // Connect Link support — API key + username form.
  credentialFields = CLICKPOST_FORM.credentialFields
  exchangeCredentials = CLICKPOST_FORM.exchangeCredentials

  readonly platform = 'clickpost'
  readonly version = '1'

  constructor(_config: ClickPostAdapterConfig = {}) {}

  // ── Auth ─────────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return exchangeApiKey(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Tracking Events ──────────────────────────────────────────────────────────

  async getTrackingEvents(
    credentials: Credentials,
    trackingNumber: string,
  ): Promise<TrackingEvent[]> {
    const client = new ClickPostClient(credentials)
    // POST /v2/tracking/awb-register/ — register & fetch tracking for a waybill
    const res = await client.post<ClickPostTrackingResponse>(
      'v2/tracking/awb-register/',
      { waybill: trackingNumber },
    )
    const result = res.result
    if (!result) return []
    return transformTrackingResult(result)
  }

  async listTrackingEvents(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<TrackingEvent[]> {
    const client = new ClickPostClient(credentials)
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    // GET /v3/tracking/awb-list — paginated list of updated shipments
    const res = await client.get<ClickPostListResponse<ClickPostTrackingResult>>(
      'v3/tracking/awb-list',
      {
        limit,
        page: (params as Record<string, unknown>).page ?? 1,
      },
    )
    return (res.result ?? []).flatMap(transformTrackingResult)
  }

  // ── Shipments ────────────────────────────────────────────────────────────────

  /**
   * Shipments updated since `updatedAfter`, from `GET /api/v1/updated-order`
   * ("Fetch updated shipment list",
   * https://docs.clickpost.ai/reference/fetch-updated-orders-list), the only
   * shipment list ClickPost documents. It takes `start_date`/`end_date` in
   * epoch seconds, and "Difference between start time and end time cannot be
   * greater than 1800 seconds(30 mins)"; it documents no paging parameter and
   * no lookback limit.
   *
   * The walk runs over 30-minute windows aligned to UTC half-hour
   * boundaries, from `updatedAfter` up to the boundary at or after now,
   * through `pageByRows`. With no `updatedAfter` there is no documented
   * lower bound, so the call is refused before any request.
   *
   * It runs OLDEST-first on purpose. The endpoint "retrieves the latest
   * shipment tracking status updates between the specified start and end
   * time", so an AWB updated in two windows comes back from both, each with
   * the status as of its window, and nothing documented tells a window's row
   * from the current one (`updated_at` is the same in both). Walked
   * newest-first, a caller that upserts in page order would end on the older
   * status (IN_TRANSIT after DELIVERED). Walked oldest-first, the last copy
   * of every AWB is its newest. The windows are fixed by `updatedAfter`, so
   * page N is the same rows as long as those windows hold the same rows.
   */
  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    if (!params.updatedAfter) {
      throw Object.assign(
        new Error(
          'ClickPost cannot list shipments without updated_after: its only shipment list, ' +
            'GET /api/v1/updated-order, needs a start_date/end_date window ("Difference between ' +
            'start time and end time cannot be greater than 1800 seconds(30 mins)") and ' +
            'documents no lookback limit. Pass updated_after to walk the windows since then.',
        ),
        { statusCode: 501, code: 'NOT_SUPPORTED' },
      )
    }
    const W = UPDATED_ORDER_WINDOW_SECONDS
    const lower = Math.floor(params.updatedAfter.getTime() / 1000)
    const top = Math.ceil(Date.now() / 1000 / W) * W
    if (lower >= top) {
      reportUpstreamPage(params, { hasMore: false })
      return []
    }
    // The UTC half-hour boundary at or before updatedAfter.
    const base = Math.floor(lower / W) * W
    const windows = (top - base) / W
    const client = new ClickPostClient(credentials)
    const key =
      `clickpost:${connectionScope(clickPostUsername(credentials), credentials)}` +
      `:updated-order:${lower}:${top}`
    const { items } = await pageByRows<Shipment, number>(
      key,
      params,
      async (cursor) => {
        const index = cursor ?? 0
        const end = base + (index + 1) * W
        const start = Math.max(end - W, lower)
        const res = await client.get<ClickPostListResponse<ClickPostUpdatedOrder>>(
          'v1/updated-order',
          { start_date: start, end_date: end },
        )
        assertSuccess(res.meta)
        return {
          items: (res.result ?? []).map(transformUpdatedOrder),
          next: index + 1 < windows ? index + 1 : null,
        }
      },
      { maxUpstreamPages: windows + 1 },
    )
    return items
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new ClickPostClient(credentials)
    const res = await client.get<ClickPostSingleResponse<ClickPostOrderResult>>(
      'v3/create-order',
      { reference_number: id },
    )
    return transformOrderResult(res.result)
  }

  async createShipment(
    credentials: Credentials,
    data: Partial<Shipment>,
  ): Promise<Shipment> {
    const client = new ClickPostClient(credentials)
    const payload = {
      pickup_name: data.originAddress?.name ?? '',
      pickup_address: data.originAddress?.street1 ?? '',
      pickup_city: data.originAddress?.city ?? '',
      pickup_state: data.originAddress?.state ?? '',
      pickup_pincode: data.originAddress?.postalCode ?? '',
      pickup_country: data.originAddress?.country ?? 'IN',
      drop_name: data.destinationAddress?.name ?? '',
      drop_phone: data.destinationAddress?.phone ?? '',
      drop_address: data.destinationAddress?.street1 ?? '',
      drop_city: data.destinationAddress?.city ?? '',
      drop_state: data.destinationAddress?.state ?? '',
      drop_pincode: data.destinationAddress?.postalCode ?? '',
      drop_country: data.destinationAddress?.country ?? 'IN',
      reference_number: data.reference ?? data.trackingNumber ?? undefined,
      weight: data.totalWeight?.value ?? 0.5,
      length: data.dimensions?.length ?? undefined,
      breadth: data.dimensions?.width ?? undefined,
      height: data.dimensions?.height ?? undefined,
      courier_partner: data.carrierId ? Number(data.carrierId) : undefined,
      order_type: 'PREPAID',
      label: true,
    }
    const res = await client.post<ClickPostSingleResponse<ClickPostOrderResult>>(
      'v3/create-order/',
      payload,
    )
    return transformOrderResult(res.result)
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new ClickPostClient(credentials)
    await client.post('v1/cancel-order/', { waybill: id })
  }

  // ── Orders ───────────────────────────────────────────────────────────────────

  /**
   * Refused: GET /api/v3/create-order/ reads ONE order
   * (https://docs.clickpost.ai/docs/fetch-awb-number-reference-number-for-already-manifested-order:
   * "You need to Pass either `awb` and `cp_id` or `key` and `reference_number`"),
   * and ClickPost documents no order list.
   */
  async listOrders(_credentials: Credentials, _params: QueryParams): Promise<Order[]> {
    throw Object.assign(
      new Error(
        'ClickPost cannot list orders: GET /api/v3/create-order/ reads one order ("You need to ' +
          'Pass either `awb` and `cp_id` or `key` and `reference_number`"), and ClickPost ' +
          'documents no order list.',
      ),
      { statusCode: 501, code: 'NOT_SUPPORTED' },
    )
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new ClickPostClient(credentials)
    const res = await client.get<ClickPostSingleResponse<ClickPostOrderDetail>>(
      'v3/create-order',
      { reference_number: id },
    )
    return transformOrder(res.result)
  }

  async createOrder(
    credentials: Credentials,
    data: Partial<Order>,
  ): Promise<Order> {
    const client = new ClickPostClient(credentials)
    const items = (data.lineItems ?? []).map((li) => ({
      sku: li.sku ?? undefined,
      description: li.name ?? li.description ?? undefined,
      price: li.unitAmount ?? undefined,
      quantity: li.quantity ?? 1,
    }))
    const payload = {
      pickup_name: data.originAddress?.name ?? '',
      pickup_address: data.originAddress?.street1 ?? '',
      pickup_city: data.originAddress?.city ?? '',
      pickup_state: data.originAddress?.state ?? '',
      pickup_pincode: data.originAddress?.postalCode ?? '',
      pickup_country: data.originAddress?.country ?? 'IN',
      drop_name: data.destinationAddress?.name ?? '',
      drop_phone: data.destinationAddress?.phone ?? '',
      drop_email: data.destinationAddress?.email ?? undefined,
      drop_address: data.destinationAddress?.street1 ?? '',
      drop_city: data.destinationAddress?.city ?? '',
      drop_state: data.destinationAddress?.state ?? '',
      drop_pincode: data.destinationAddress?.postalCode ?? '',
      drop_country: data.destinationAddress?.country ?? 'IN',
      reference_number: data.orderNumber ?? data.id ?? undefined,
      invoice_number: data.orderNumber ?? undefined,
      invoice_value: data.totalAmount ?? 0,
      order_type: 'PREPAID',
      items,
      label: true,
    }
    const res = await client.post<ClickPostSingleResponse<ClickPostOrderDetail>>(
      'v3/create-order/',
      payload,
    )
    return transformOrder(res.result)
  }

  async cancelOrder(credentials: Credentials, id: string): Promise<void> {
    const client = new ClickPostClient(credentials)
    await client.post('v1/cancel-order/', { reference_number: id })
  }

  // ── Carriers ─────────────────────────────────────────────────────────────────

  /**
   * The account's carrier partners, from `GET /api/v1/fetch-accounts`
   * (https://docs.clickpost.ai/reference/fetch-accounts-from-clickpost-1):
   * "The API will give an array of **all** carrier partner accounts". It has
   * no paging, so the whole list is sliced with `pageLocally`. `active` is
   * required by the API reference; `true` asks for the accounts "currently
   * active on their Clickpost dashboard", the ones order creation accepts.
   */
  async listCarriers(credentials: Credentials, params: QueryParams): Promise<Carrier[]> {
    return pageLocally(await this.fetchCarriers(credentials), params)
  }

  async getCarrier(credentials: Credentials, id: string): Promise<Carrier> {
    const carrier = (await this.fetchCarriers(credentials)).find((c) => c.id === id)
    if (!carrier) {
      throw Object.assign(new Error(`ClickPost carrier not found: ${id}`), {
        statusCode: 404,
        code: 'NOT_FOUND',
      })
    }
    return carrier
  }

  private async fetchCarriers(credentials: Credentials): Promise<Carrier[]> {
    const client = new ClickPostClient(credentials)
    const res = await client.get<ClickPostSingleResponse<ClickPostFetchAccountsResult>>(
      'v1/fetch-accounts',
      { active: true },
    )
    assertSuccess(res.meta)
    return transformCarriers(res.result?.accounts ?? [])
  }

  // ── Rates ────────────────────────────────────────────────────────────────────

  async getRates(
    credentials: Credentials,
    params: RateRequestParams,
  ): Promise<Rate[]> {
    const client = new ClickPostClient(credentials)
    const pkg = params.packages?.[0]
    const payload = [
      {
        pickup_pincode: params.originAddress.postalCode ?? '',
        drop_pincode: params.destinationAddress.postalCode ?? '',
        order_type: 'PREPAID',
        weight: pkg?.weight?.value ?? 0.5,
        length: pkg?.dimensions?.length ?? undefined,
        breadth: pkg?.dimensions?.width ?? undefined,
        height: pkg?.dimensions?.height ?? undefined,
        cod_amount: 0,
      },
    ]
    const res = await client.post<ClickPostRecommendationResponse>(
      'v1/recommendation_api/',
      payload,
    )
    return (res.result?.preference ?? []).map(transformRate)
  }

  // ── Labels ───────────────────────────────────────────────────────────────────

  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    const client = new ClickPostClient(credentials)
    // id is expected to be the waybill number
    const res = await client.get<ClickPostSingleResponse<ClickPostLabelResponse>>(
      'v1/fetch/shippinglabel/',
      { waybill: id },
    )
    return transformLabel(res.result)
  }

  async listLabels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Label[]> {
    const client = new ClickPostClient(credentials)
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<ClickPostListResponse<ClickPostLabelResponse>>(
      'v1/fetch/shippinglabel/',
      {
        page_size: limit,
        page: (params as Record<string, unknown>).page ?? 1,
      },
    )
    return (res.result ?? []).map(transformLabel)
  }

  // ── Manifests ────────────────────────────────────────────────────────────────

  async listManifests(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Manifest[]> {
    const client = new ClickPostClient(credentials)
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<ClickPostListResponse<ClickPostManifest>>(
      'v1/manifest/',
      {
        page_size: limit,
        page: (params as Record<string, unknown>).page ?? 1,
      },
    )
    return (res.result ?? []).map(transformManifest)
  }

  async getManifest(credentials: Credentials, id: string): Promise<Manifest> {
    const client = new ClickPostClient(credentials)
    const res = await client.get<ClickPostSingleResponse<ClickPostManifest>>(
      'v1/manifest/',
      { manifest_id: id },
    )
    return transformManifest(res.result)
  }

  async createManifest(
    credentials: Credentials,
    data: Partial<Manifest>,
  ): Promise<Manifest> {
    const client = new ClickPostClient(credentials)
    const body: Record<string, unknown> = {
      waybills: data.shipmentIds ?? [],
      ...(data.carrierId ? { cp_id: Number(data.carrierId) } : {}),
    }
    const res = await client.post<ClickPostSingleResponse<ClickPostManifest>>(
      'v1/manifest/',
      body,
    )
    return transformManifest(res.result)
  }
}
