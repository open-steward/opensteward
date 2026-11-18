import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  pageByRows,
  pageLocally,
  reportUpstreamPage,
  simpleApiKey,
} from '@opensteward/shared'
import { createHmac, timingSafeEqual } from 'crypto'
import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
  RateRequestParams,
  PickupRequestParams,
  PickupCancelParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { Order } from '../../schema/order'
import type { Carrier } from '../../schema/carrier'
import type { Manifest } from '../../schema/manifest'
import type { Pickup } from '../../schema/pickup'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Label } from '../../schema/label'
import type { WebhookEvent } from '../../schema/webhook'

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: warehouse — EasyPost has no warehouse/fulfillment-location resource in its REST API
// Pickup: list/get/create/cancel over /v2/pickups (create = POST then buy the cheapest
// pickup_rate, the way createLabel buys a shipment). Not yet declared in metadata.ts —
// the metadata PR owns that, and totalResources stays 8 until it lands.

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { EasyPostClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformShipment, type EasyPostShipment } from './transform/shipment'
import { transformRate } from './transform/rate'
import { transformLabel } from './transform/label'
import { transformTracker, type EasyPostTracker } from './transform/tracking'
import { transformOrder, type EasyPostOrder } from './transform/order'
import { transformCarrier, type EasyPostCarrierAccount } from './transform/carrier'
import { transformScanForm, type EasyPostScanForm } from './transform/manifest'
import { transformPickup, cheapestPickupRate, type EasyPostPickup } from './transform/pickup'

interface EasyPostAdapterConfig {
  clientId?: string
  clientSecret?: string
  redirectUri?: string
  scopes?: string[]
}
const SIMPLE_API_KEY_FORM = simpleApiKey()

/**
 * The envelope of a paginated "retrieve all" endpoint (`GET /v2/<resource>`):
 * the rows under the same plural name as the path, and `has_more`.
 */
type EasyPostListEnvelope<K extends string, T> = Partial<Record<K, T[]>> & { has_more?: boolean }

/**
 * The `before_id` that fetches the page after `rows`: the id of the last row,
 * while the platform says it has more. docs.easypost.com/docs/pagination: "If
 * you need to retrieve a successive page when the has_more key is present,
 * make another "retrieve all" request and set the before_id to the ID of the
 * last item returned."
 */
function nextBeforeId(
  hasMore: boolean | undefined,
  rows: ReadonlyArray<{ id: string }>,
): string | undefined {
  return hasMore === true && rows.length > 0 ? rows[rows.length - 1]!.id : undefined
}

export class EasyPostAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'easypost'
  readonly version = '1'

  /**
   * "We limit the number of records per page to 100, and most endpoints
   * default to 20." (docs.easypost.com/docs/pagination). Every list method
   * pages at the requested size up to it and reports `has_more`, or slices an
   * unpaginated list locally (carrier accounts).
   */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  constructor(_config: EasyPostAdapterConfig = {}) {}

  // ── Paging ─────────────────────────────────────────────────────────────────

  /**
   * Pager scope for one connection. An EasyPost key carries no account id, so
   * the scope is the platform plus a fingerprint of the API key
   * (`connectionScope`), never the key itself.
   */
  private pagerScope(credentials: Credentials): string {
    return connectionScope('easypost', credentials)
  }

  /** `page_size` for this request: the caller's limit, at most the documented 100. */
  private upstreamPageSize(params: QueryParams): number {
    return Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
  }

  /**
   * One caller page of a `before_id`-paginated "retrieve all" list, where one
   * upstream page is one caller page.
   *
   * EasyPost has no page number or offset: newest first, `page_size` rows,
   * `has_more` on the envelope, and the next page is the same request with
   * `before_id` set to the last id returned. Sending `page_size` alone made
   * page 2 page 1 again. The caller's 1-based `page` now resolves through the
   * shared cursor pager, and `has_more` is reported so a full last page is
   * not mistaken for more. `explicitBeforeId` is a caller already holding a
   * position: that one page is fetched as asked.
   */
  private async beforeIdList<K extends string, T extends { id: string }>(
    credentials: Credentials,
    params: QueryParams,
    resource: K,
    explicitBeforeId?: string,
  ): Promise<T[]> {
    const client = new EasyPostClient(credentials)
    const size = this.upstreamPageSize(params)
    const query = { page_size: size }
    const fetch = async (beforeId: string | undefined) => {
      const res = await client.get<EasyPostListEnvelope<K, T>>(
        resource,
        beforeId === undefined ? query : { ...query, before_id: beforeId },
      )
      const rows = (res[resource] as T[] | undefined) ?? []
      return { items: rows, next: nextBeforeId(res.has_more, rows) }
    }
    let page: { items: T[]; hasMore: boolean }
    if (explicitBeforeId !== undefined) {
      const one = await fetch(explicitBeforeId)
      page = { items: one.items, hasMore: one.next !== undefined }
    } else {
      page = await pageByCursor<T, string>(
        cursorPagerKey(this.pagerScope(credentials), resource, query),
        params.page,
        fetch,
      )
    }
    // `pageSize` matters only below the limit (a direct call above 100, or
    // none): the page is then judged at the size actually sent.
    reportUpstreamPage(params, { hasMore: page.hasMore, pageSize: size })
    return page.items
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // For EasyPost the "code" is the API key itself.
    return exchangeApiKey(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Webhook ────────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    // EasyPost signs webhooks with HMAC-SHA256. The digest is hex-encoded and
    // sent in the `X-Hmac-Signature` header.
    const signature = headers['x-hmac-signature'] ?? ''
    const expected = createHmac('sha256', secret).update(payload).digest('hex')
    try {
      return timingSafeEqual(Buffer.from(signature, 'utf8'), Buffer.from(expected, 'utf8'))
    } catch {
      return false
    }
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    const description = String(payload['description'] ?? '')
    const result = payload['result'] as Record<string, unknown> | undefined
    const resourceId = result ? String(result['id'] ?? '') : undefined

    // Map EasyPost event description to canonical resource type and action.
    // Examples: "tracker.updated", "shipment.created", "batch.updated"
    const [resource, rawAction] = description.split('.')

    type CanonicalResource = WebhookEvent['resourceType']
    const resourceTypeMap: Record<string, CanonicalResource> = {
      tracker: 'tracking_event',
      shipment: 'shipment',
      order: 'order',
      label: 'label',
    }

    const resourceType = resourceTypeMap[resource]
    if (!resourceType) return []

    type CanonicalAction = WebhookEvent['action']
    const actionMap: Record<string, CanonicalAction> = {
      created: 'created',
      updated: 'updated',
      deleted: 'deleted',
      cancelled: 'cancelled',
    }

    const action: CanonicalAction = actionMap[rawAction] ?? 'updated'

    return [
      {
        platform: 'easypost',
        type: description,
        resourceType,
        action,
        resourceId: resourceId || undefined,
        payload,
      },
    ]
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    // Cursor-paged by before_id; updatedAfter is not directly supported.
    const rows = await this.beforeIdList<'shipments', EasyPostShipment>(
      credentials,
      params,
      'shipments',
    )
    return rows.map(transformShipment)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new EasyPostClient(credentials)
    const raw = await client.get<EasyPostShipment>(`shipments/${id}`)
    return transformShipment(raw)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new EasyPostClient(credentials)
    const raw = await client.post<EasyPostShipment>('shipments', {
      shipment: {
        reference: data.reference,
        to_address: data.destinationAddress
          ? {
              name: data.destinationAddress.name,
              company: data.destinationAddress.company,
              street1: data.destinationAddress.street1,
              street2: data.destinationAddress.street2,
              city: data.destinationAddress.city,
              state: data.destinationAddress.state,
              zip: data.destinationAddress.postalCode,
              country: data.destinationAddress.country,
              phone: data.destinationAddress.phone,
              email: data.destinationAddress.email,
            }
          : undefined,
        from_address: data.originAddress
          ? {
              name: data.originAddress.name,
              company: data.originAddress.company,
              street1: data.originAddress.street1,
              street2: data.originAddress.street2,
              city: data.originAddress.city,
              state: data.originAddress.state,
              zip: data.originAddress.postalCode,
              country: data.originAddress.country,
              phone: data.originAddress.phone,
              email: data.originAddress.email,
            }
          : undefined,
        parcel: data.totalWeight
          ? {
              weight: data.totalWeight.value,
            }
          : undefined,
      },
    })
    return transformShipment(raw)
  }

  // ── Orders ─────────────────────────────────────────────────────────────────

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new EasyPostClient(credentials)
    const raw = await client.get<EasyPostOrder>(`orders/${id}`)
    return transformOrder(raw)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new EasyPostClient(credentials)
    const raw = await client.post<EasyPostOrder>('orders', {
      order: {
        reference: data.orderNumber,
        to_address: data.destinationAddress
          ? {
              name: data.destinationAddress.name,
              street1: data.destinationAddress.street1,
              street2: data.destinationAddress.street2,
              city: data.destinationAddress.city,
              state: data.destinationAddress.state,
              zip: data.destinationAddress.postalCode,
              country: data.destinationAddress.country,
              phone: data.destinationAddress.phone,
              email: data.destinationAddress.email,
            }
          : undefined,
        from_address: data.originAddress
          ? {
              name: data.originAddress.name,
              street1: data.originAddress.street1,
              street2: data.originAddress.street2,
              city: data.originAddress.city,
              state: data.originAddress.state,
              zip: data.originAddress.postalCode,
              country: data.originAddress.country,
              phone: data.originAddress.phone,
              email: data.originAddress.email,
            }
          : undefined,
      },
    })
    return transformOrder(raw)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new EasyPostClient(credentials)
    // EasyPost: create a tracker (idempotent by tracking_code + carrier)
    const raw = await client.post<EasyPostTracker>('trackers', {
      tracker: { tracking_code: trackingNumber },
    })
    return transformTracker(raw)
  }

  /**
   * Events flattened out of `before_id` pages of trackers. A tracker yields
   * one event per tracking detail (or one summary event), so a page of
   * `limit` trackers is not a page of `limit` events: `pageByRows` walks the
   * tracker pages and cuts exactly the caller's events, with `hasMore` exact.
   */
  async listTrackingEvents(credentials: Credentials, params: QueryParams): Promise<TrackingEvent[]> {
    const client = new EasyPostClient(credentials)
    const query = { page_size: this.upstreamPageSize(params) }
    const { items } = await pageByRows<TrackingEvent, string>(
      cursorPagerKey(this.pagerScope(credentials), 'trackers#events', query),
      params,
      async (beforeId) => {
        const res = await client.get<EasyPostListEnvelope<'trackers', EasyPostTracker>>(
          'trackers',
          beforeId === undefined ? query : { ...query, before_id: beforeId },
        )
        const trackers = res.trackers ?? []
        return {
          items: trackers.flatMap(transformTracker),
          next: nextBeforeId(res.has_more, trackers),
        }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return items
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new EasyPostClient(credentials)
    // Create a shipment without purchasing to get rates
    const res = await client.post<EasyPostShipment>('shipments', {
      shipment: {
        to_address: {
          name: params.destinationAddress.name,
          street1: params.destinationAddress.street1,
          street2: params.destinationAddress.street2,
          city: params.destinationAddress.city,
          state: params.destinationAddress.state,
          zip: params.destinationAddress.postalCode,
          country: params.destinationAddress.country,
        },
        from_address: {
          name: params.originAddress.name,
          street1: params.originAddress.street1,
          street2: params.originAddress.street2,
          city: params.originAddress.city,
          state: params.originAddress.state,
          zip: params.originAddress.postalCode,
          country: params.originAddress.country,
        },
        parcel: params.packages[0]?.weight
          ? { weight: params.packages[0].weight.value }
          : undefined,
      },
    })
    return (res.rates ?? []).map(transformRate)
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    // EasyPost labels live on shipments; id is a shipment id
    const client = new EasyPostClient(credentials)
    const raw = await client.get<EasyPostShipment>(`shipments/${id}`)
    if (!raw.postage_label) {
      throw new Error(`No label found on shipment ${id}`)
    }
    return transformLabel(
      raw.postage_label,
      raw.id,
      raw.tracking_code ?? undefined,
      raw.selected_rate?.carrier ?? undefined,
      raw.selected_rate?.service ?? undefined,
    )
  }

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    if (!data.shipmentId) throw new Error('shipmentId is required to purchase a label')
    const client = new EasyPostClient(credentials)
    // Purchasing a label on EasyPost = buying the shipment with the lowest rate
    const raw = await client.post<EasyPostShipment>(`shipments/${data.shipmentId}/buy`, {
      rate: { id: (data.metadata as Record<string, unknown> | undefined)?.rate_id ?? '' },
    })
    if (!raw.postage_label) {
      throw new Error(`Label purchase did not return a postage_label for shipment ${data.shipmentId}`)
    }
    return transformLabel(
      raw.postage_label,
      raw.id,
      raw.tracking_code ?? undefined,
      raw.selected_rate?.carrier ?? undefined,
      raw.selected_rate?.service ?? undefined,
    )
  }

  async voidLabel(credentials: Credentials, id: string): Promise<void> {
    // EasyPost: refund/void a shipment label
    const client = new EasyPostClient(credentials)
    await client.post<unknown>(`shipments/${id}/refund`, {})
  }

  // ── Carriers ───────────────────────────────────────────────────────────────

  /**
   * "Retrieve an unpaginated list of all CarrierAccounts available to the
   * authenticated account." (docs.easypost.com/docs/carrier-accounts): a bare
   * array that takes no `page_size`, so the whole list is fetched and sliced.
   */
  async listCarriers(credentials: Credentials, params: QueryParams): Promise<Carrier[]> {
    const client = new EasyPostClient(credentials)
    const res = await client.get<EasyPostCarrierAccount[]>('carrier_accounts')
    return pageLocally((Array.isArray(res) ? res : []).map(transformCarrier), params)
  }

  async getCarrier(credentials: Credentials, id: string): Promise<Carrier> {
    const client = new EasyPostClient(credentials)
    const raw = await client.get<EasyPostCarrierAccount>(`carrier_accounts/${id}`)
    return transformCarrier(raw)
  }

  // ── Manifests (ScanForms) ──────────────────────────────────────────────────

  async listManifests(credentials: Credentials, params: QueryParams): Promise<Manifest[]> {
    const rows = await this.beforeIdList<'scan_forms', EasyPostScanForm>(
      credentials,
      params,
      'scan_forms',
    )
    return rows.map(transformScanForm)
  }

  async getManifest(credentials: Credentials, id: string): Promise<Manifest> {
    const client = new EasyPostClient(credentials)
    const raw = await client.get<EasyPostScanForm>(`scan_forms/${id}`)
    return transformScanForm(raw)
  }

  async createManifest(credentials: Credentials, data: Partial<Manifest>): Promise<Manifest> {
    const client = new EasyPostClient(credentials)
    // EasyPost scan_forms are created by passing an array of shipment IDs
    const raw = await client.post<EasyPostScanForm>('scan_forms', {
      shipment_ids: data.shipmentIds ?? [],
    })
    return transformScanForm(raw)
  }

  // ── Pickups ────────────────────────────────────────────────────────────────

  async listPickups(credentials: Credentials, params: QueryParams): Promise<Pickup[]> {
    // Newest first, walked by before_id. A caller holding a `cursor` (the last
    // id of its previous page) gets the one page after it, and `page` is not
    // consulted: the cursor is the position. The router and the sync worker
    // never send one. updatedAfter is not directly supported, as on
    // listShipments.
    const rows = await this.beforeIdList<'pickups', EasyPostPickup>(
      credentials,
      params,
      'pickups',
      typeof params.cursor === 'string' ? params.cursor : undefined,
    )
    return rows.map(transformPickup)
  }

  async getPickup(credentials: Credentials, id: string): Promise<Pickup> {
    const client = new EasyPostClient(credentials)
    const raw = await client.get<EasyPostPickup>(`pickups/${id}`)
    return transformPickup(raw)
  }

  async createPickup(credentials: Credentials, data: PickupRequestParams): Promise<Pickup> {
    // EasyPost schedules a pickup for ONE purchased shipment or ONE purchased
    // batch — never a list. A batch id rides on the index signature.
    const batchId = typeof data.batch === 'string' ? data.batch : undefined
    const shipmentIds = data.shipmentIds
    if (!batchId && !shipmentIds?.length) {
      throw new Error(
        'EasyPost pickups need `shipmentIds` (one purchased shipment id) or `batch` (a purchased batch id)',
      )
    }
    if (shipmentIds && shipmentIds.length > 1) {
      throw new Error(
        `EasyPost schedules a pickup for one shipment or one batch, got ${shipmentIds.length} shipmentIds — create a batch and pass its id as \`batch\``,
      )
    }
    if (!data.address) throw new Error('address is required to schedule a pickup')
    if (!(data.readyAt instanceof Date)) throw new Error('readyAt is required to schedule a pickup')

    const client = new EasyPostClient(credentials)
    // Step 1: create. EasyPost quotes a pickup_rate per carrier account that
    // supports scheduled pickups; nothing is booked yet (status "unknown").
    // `carrierId` is a carrier account id (`ca_…`, as listCarriers returns)
    // and narrows the quotes to that account.
    const created = await client.post<EasyPostPickup>('pickups', {
      pickup: {
        reference: typeof data.reference === 'string' ? data.reference : undefined,
        min_datetime: data.readyAt.toISOString(),
        max_datetime: data.closeAt?.toISOString(),
        shipment: shipmentIds?.[0],
        batch: batchId,
        address: {
          name: data.address.name,
          company: data.address.company,
          street1: data.address.street1,
          street2: data.address.street2,
          city: data.address.city,
          state: data.address.state,
          zip: data.address.postalCode,
          country: data.address.country,
          phone: data.address.phone,
          email: data.address.email,
        },
        carrier_accounts: data.carrierId ? [data.carrierId] : undefined,
        instructions: data.instructions,
      },
    })

    // Step 2: buy the cheapest quote, the way createLabel buys a shipment. The
    // buy endpoint keys on carrier + service, not the rate id. With no quote
    // the unbooked pickup stays on the account (listPickups shows it) and the
    // carriers' own errors are the useful part of the failure.
    const rate = cheapestPickupRate(created.pickup_rates)
    if (!rate) {
      const problems = created.messages
        ?.map((m) => `${m.carrier ?? 'carrier'}: ${m.message ?? m.type ?? 'error'}`)
        .join('; ')
      throw new Error(
        `EasyPost returned no pickup_rates for pickup ${created.id}${problems ? ` — ${problems}` : ''}`,
      )
    }
    const raw = await client.post<EasyPostPickup>(`pickups/${created.id}/buy`, {
      carrier: rate.carrier,
      service: rate.service,
    })
    return transformPickup(raw)
  }

  async cancelPickup(
    credentials: Credentials,
    id: string,
    _data?: PickupCancelParams,
  ): Promise<Pickup> {
    // EasyPost cancels by id alone; a `reason` has nowhere to go and is dropped.
    const client = new EasyPostClient(credentials)
    const raw = await client.post<EasyPostPickup>(`pickups/${id}/cancel`, {})
    return transformPickup(raw)
  }
}
