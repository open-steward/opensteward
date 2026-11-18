import {
  connectionScope,
  cursorPagerKey,
  pageByRows,
  pageOffset,
  reportUpstreamPage,
  customForm,
} from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
  RateRequestParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { Order } from '../../schema/order'
import type { Carrier } from '../../schema/carrier'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Label } from '../../schema/label'
import type { Manifest } from '../../schema/manifest'
import type { WebhookEvent } from '../../schema/webhook'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { KarrioClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformShipment, type KarrioShipment } from './transform/shipment'
import { transformRate, type KarrioRateResult } from './transform/rate'
import { transformLabel } from './transform/label'
import { transformTracker, type KarrioTracker } from './transform/tracking'
import { transformOrder, type KarrioOrder } from './transform/order'
import { transformManifest, type KarrioManifest } from './transform/manifest'
import { transformCarrier, type KarrioCarrierConnection } from './transform/carrier'

interface KarrioAdapterConfig {
  baseUrl?: string
}

/**
 * Karrio is self-hosted, so a connection needs the customer's instance URL as
 * well as the API key (https://docs.karrio.io/reference/openapi,
 * "Authentication": "$ curl https://instance.api.com/v1/shipments -u key_xxxxxx:").
 */
const CREDENTIAL_FORM = customForm({
  fields: [
    {
      name: 'apiKey',
      label: 'API key',
      type: 'password',
      required: true,
      placeholder: 'key_xxxxxx',
    },
    {
      name: 'baseUrl',
      label: 'Karrio API URL',
      type: 'url',
      required: true,
      placeholder: 'https://api.your-karrio-instance.com',
      helpText: 'The URL of your Karrio instance (the host that serves /v1/shipments).',
    },
  ],
  exchange: async (fields: Record<string, string>): Promise<Credentials> => {
    const apiKey = (fields['apiKey'] ?? '').trim()
    if (!apiKey) throw new Error('API key is required.')
    return exchangeApiKey(apiKey, fields['baseUrl'] ?? '')
  },
})

/**
 * Karrio list paging. Every list endpoint is offset-paged, per the API
 * reference (https://docs.karrio.io/reference/openapi, "Pagination"):
 *   "Karrio utilizes offset-based pagination via the offset and limit
 *   parameters." ... "The limit parameter take a limit on the number of
 *   objects to be returned from 1 to 100."
 * and a list answers { count, next, previous, results }, `next` being the
 * URL of the following page (null on the last).
 *
 * Shipments, orders, manifests and carrier connections are one upstream page
 * per caller page.
 * Tracking events are flattened out of trackers, and labels are the shipments
 * that carry a label_url, so one upstream page is not one caller page there:
 * those two page by rows.
 */
interface KarrioList<T> {
  count?: number
  next?: string | null
  previous?: string | null
  results?: T[]
}

/** The size actually sent upstream: the caller's limit, capped at Karrio's 100. */
function sentSize(params: QueryParams): number {
  const asked = params.limit
  const n =
    typeof asked === 'number' && Number.isFinite(asked) && asked >= 1
      ? Math.floor(asked)
      : DEFAULT_PAGE_SIZE
  return Math.min(n, MAX_PAGE_SIZE)
}

/** One caller page of an offset-paged Karrio list, with its end reported. */
async function listOffsetPage<T>(
  client: KarrioClient,
  path: string,
  params: QueryParams,
): Promise<T[]> {
  const size = sentSize(params)
  const offset = pageOffset(params, size)
  const res = await client.get<KarrioList<T>>(path, { limit: size, offset })
  const rows = res.results ?? []
  const count = typeof res.count === 'number' ? res.count : undefined
  const hasMore =
    res.next !== undefined
      ? typeof res.next === 'string' && res.next !== '' && rows.length > 0
      : count !== undefined
        ? offset + rows.length < count
        : rows.length === size
  reportUpstreamPage(params, {
    hasMore,
    ...(count !== undefined ? { totalCount: count } : {}),
    pageSize: size,
  })
  return rows
}

/**
 * The caller's page of rows derived from an offset-paged Karrio list, walked
 * in upstream pages of MAX_PAGE_SIZE. `toRows` flattens or filters one
 * upstream page; the cursor is the next upstream offset.
 */
async function listDerivedRows<T, R>(
  client: KarrioClient,
  credentials: Credentials,
  path: string,
  collection: string,
  query: Record<string, unknown>,
  params: QueryParams,
  toRows: (results: T[]) => R[],
): Promise<R[]> {
  // The instance is part of the scope: one key never serves two Karrio hosts.
  const key = cursorPagerKey(connectionScope(client.host, credentials), collection, {
    ...query,
    limit: MAX_PAGE_SIZE,
  })
  const { items } = await pageByRows<R, number>(
    key,
    params,
    async (cursor) => {
      const offset = cursor ?? 0
      const res = await client.get<KarrioList<T>>(path, {
        limit: MAX_PAGE_SIZE,
        offset,
        ...query,
      })
      const results = res.results ?? []
      const more =
        results.length > 0 &&
        (res.next !== undefined
          ? typeof res.next === 'string' && res.next !== ''
          : typeof res.count === 'number'
            ? offset + results.length < res.count
            : results.length === MAX_PAGE_SIZE)
      return { items: toRows(results), next: more ? offset + results.length : undefined }
    },
    { defaultLimit: DEFAULT_PAGE_SIZE },
  )
  return items
}

export class KarrioAdapter implements LogisticsAdapter {
  // Connect Link support — API key plus the instance URL.
  credentialFields = CREDENTIAL_FORM.credentialFields
  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  readonly platform = 'karrio'
  readonly version = '1'

  constructor(private readonly config: KarrioAdapterConfig = {}) {}

  /** A client for the connection's own Karrio instance. */
  private client(credentials: Credentials): KarrioClient {
    return new KarrioClient(credentials, this.config.baseUrl)
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // For Karrio the "code" is the API key itself.
    return exchangeApiKey(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────
  // Karrio does not publish a documented webhook signing scheme;
  // verifyWebhook is intentionally omitted (treated as unverified).

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    // Karrio webhook payload shape: { event: "shipment.created", data: { ... } }
    const eventType = String(payload['event'] ?? '')
    const data = (payload['data'] ?? payload) as Record<string, unknown>
    const resourceId = String(data['id'] ?? '')

    const [resource, rawAction] = eventType.split('.')

    type CanonicalResource = WebhookEvent['resourceType']
    const resourceTypeMap: Record<string, CanonicalResource> = {
      shipment: 'shipment',
      tracker: 'tracking_event',
      tracking: 'tracking_event',
      order: 'order',
      rate: 'rate',
      manifest: 'manifest',
    }

    const resourceType = resourceTypeMap[resource]
    if (!resourceType) return []

    type CanonicalAction = WebhookEvent['action']
    const actionMap: Record<string, CanonicalAction> = {
      created: 'created',
      updated: 'updated',
      deleted: 'deleted',
      cancelled: 'cancelled',
      canceled: 'cancelled',
    }

    const action: CanonicalAction = actionMap[rawAction] ?? 'updated'

    return [
      {
        platform: 'karrio',
        type: eventType,
        resourceType,
        action,
        resourceId: resourceId || undefined,
        payload,
      },
    ]
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const rows = await listOffsetPage<KarrioShipment>(this.client(credentials), 'shipments', params)
    return rows.map(transformShipment)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = this.client(credentials)
    const raw = await client.get<KarrioShipment>(`shipments/${id}`)
    return transformShipment(raw)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = this.client(credentials)
    const raw = await client.post<KarrioShipment>('shipments', {
      recipient: data.destinationAddress
        ? {
            person_name: data.destinationAddress.name,
            company_name: data.destinationAddress.company,
            address_line1: data.destinationAddress.street1,
            address_line2: data.destinationAddress.street2,
            city: data.destinationAddress.city,
            state_code: data.destinationAddress.state,
            postal_code: data.destinationAddress.postalCode,
            country_code: data.destinationAddress.country,
            phone_number: data.destinationAddress.phone,
            email: data.destinationAddress.email,
          }
        : undefined,
      shipper: data.originAddress
        ? {
            person_name: data.originAddress.name,
            company_name: data.originAddress.company,
            address_line1: data.originAddress.street1,
            address_line2: data.originAddress.street2,
            city: data.originAddress.city,
            state_code: data.originAddress.state,
            postal_code: data.originAddress.postalCode,
            country_code: data.originAddress.country,
            phone_number: data.originAddress.phone,
            email: data.originAddress.email,
          }
        : undefined,
      parcels: data.totalWeight
        ? [{ weight: data.totalWeight.value, weight_unit: data.totalWeight.unit.toUpperCase() }]
        : undefined,
      reference: data.reference,
    })
    return transformShipment(raw)
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = this.client(credentials)
    await client.delete(`shipments/${id}`)
  }

  // ── Orders ─────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const rows = await listOffsetPage<KarrioOrder>(this.client(credentials), 'orders', params)
    return rows.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = this.client(credentials)
    const raw = await client.get<KarrioOrder>(`orders/${id}`)
    return transformOrder(raw)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = this.client(credentials)
    const raw = await client.post<KarrioOrder>('orders', {
      order_id: data.orderNumber,
      shipping_to: data.destinationAddress
        ? {
            person_name: data.destinationAddress.name,
            company_name: data.destinationAddress.company,
            address_line1: data.destinationAddress.street1,
            address_line2: data.destinationAddress.street2,
            city: data.destinationAddress.city,
            state_code: data.destinationAddress.state,
            postal_code: data.destinationAddress.postalCode,
            country_code: data.destinationAddress.country,
            phone_number: data.destinationAddress.phone,
            email: data.destinationAddress.email,
          }
        : undefined,
      shipping_from: data.originAddress
        ? {
            person_name: data.originAddress.name,
            company_name: data.originAddress.company,
            address_line1: data.originAddress.street1,
            address_line2: data.originAddress.street2,
            city: data.originAddress.city,
            state_code: data.originAddress.state,
            postal_code: data.originAddress.postalCode,
            country_code: data.originAddress.country,
            phone_number: data.originAddress.phone,
            email: data.originAddress.email,
          }
        : undefined,
    })
    return transformOrder(raw)
  }

  async cancelOrder(credentials: Credentials, id: string): Promise<void> {
    const client = this.client(credentials)
    await client.delete(`orders/${id}`)
  }

  // ── Carriers ───────────────────────────────────────────────────────────────

  /**
   * The account's carriers are its carrier connections, GET /v1/connections
   * ("List carrier connections": "Retrieve all carrier connections"), which
   * answers a paged { count, next, previous, results } list. GET /v1/carriers
   * is not the account's carriers: it is the catalogue of carrier extensions
   * the instance supports ("You can retrieve all supported carrier extensions
   * available"), a bare array with no connection ids.
   */
  async listCarriers(credentials: Credentials, params: QueryParams): Promise<Carrier[]> {
    const rows = await listOffsetPage<KarrioCarrierConnection>(
      this.client(credentials),
      'connections',
      params,
    )
    return rows.map(transformCarrier)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(
    credentials: Credentials,
    trackingNumber: string,
  ): Promise<TrackingEvent[]> {
    // GET /v1/trackers/{id_or_tracking_number}: "Retrieves a package tracker".
    // POST /v1/trackers creates one and requires carrier_name, which this call
    // does not have.
    const raw = await this.client(credentials).get<KarrioTracker>(
      `trackers/${encodeURIComponent(trackingNumber)}`,
    )
    return transformTracker(raw)
  }

  async listTrackingEvents(credentials: Credentials, params: QueryParams): Promise<TrackingEvent[]> {
    // Each tracker flattens into its events: a page of trackers is not a page of events.
    return listDerivedRows<KarrioTracker, TrackingEvent>(
      this.client(credentials),
      credentials,
      'trackers',
      'trackingevents',
      {},
      params,
      (results) => results.flatMap(transformTracker),
    )
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = this.client(credentials)
    const res = await client.post<{ rates: KarrioRateResult[] }>('rates', {
      recipient: {
        person_name: params.destinationAddress.name,
        address_line1: params.destinationAddress.street1,
        address_line2: params.destinationAddress.street2,
        city: params.destinationAddress.city,
        state_code: params.destinationAddress.state,
        postal_code: params.destinationAddress.postalCode,
        country_code: params.destinationAddress.country,
      },
      shipper: {
        person_name: params.originAddress.name,
        address_line1: params.originAddress.street1,
        address_line2: params.originAddress.street2,
        city: params.originAddress.city,
        state_code: params.originAddress.state,
        postal_code: params.originAddress.postalCode,
        country_code: params.originAddress.country,
      },
      parcels: params.packages.length > 0
        ? params.packages.map((pkg) => ({
            weight: pkg.weight?.value ?? 1,
            weight_unit: pkg.weight?.unit?.toUpperCase() ?? 'KG',
            dimension_unit: pkg.dimensions?.unit?.toUpperCase() ?? 'CM',
            length: pkg.dimensions?.length,
            width: pkg.dimensions?.width,
            height: pkg.dimensions?.height,
          }))
        : [{ weight: 1, weight_unit: 'KG' }],
      services: params.serviceCodes ?? [],
    })
    return (res.rates ?? []).map(transformRate)
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  async listLabels(credentials: Credentials, params: QueryParams): Promise<Label[]> {
    // Labels in Karrio are co-located with shipments that have a label_url.
    // /v1/shipments documents no label filter, so the filter runs here and a
    // page of shipments is not a page of labels.
    return listDerivedRows<KarrioShipment, Label>(
      this.client(credentials),
      credentials,
      'shipments',
      'labels',
      {},
      params,
      (results) => results.filter((s) => s.label_url).map(transformLabel),
    )
  }

  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    const client = this.client(credentials)
    const raw = await client.get<KarrioShipment>(`shipments/${id}`)
    if (!raw.label_url) {
      throw new Error(`No label found on shipment ${id}`)
    }
    return transformLabel(raw)
  }

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    if (!data.shipmentId) throw new Error('shipmentId is required to purchase a label')
    const client = this.client(credentials)
    const raw = await client.post<KarrioShipment>(`shipments/${data.shipmentId}/purchase`, {
      selected_rate_id: (data.metadata as Record<string, unknown> | undefined)?.rate_id ?? '',
    })
    return transformLabel(raw)
  }

  async voidLabel(credentials: Credentials, id: string): Promise<void> {
    // Karrio: cancel a shipment (voids the label)
    const client = this.client(credentials)
    await client.delete(`shipments/${id}`)
  }

  // ── Manifests ──────────────────────────────────────────────────────────────

  async listManifests(credentials: Credentials, params: QueryParams): Promise<Manifest[]> {
    const rows = await listOffsetPage<KarrioManifest>(this.client(credentials), 'manifests', params)
    return rows.map(transformManifest)
  }

  async getManifest(credentials: Credentials, id: string): Promise<Manifest> {
    const client = this.client(credentials)
    const raw = await client.get<KarrioManifest>(`manifests/${id}`)
    return transformManifest(raw)
  }

  async createManifest(credentials: Credentials, data: Partial<Manifest>): Promise<Manifest> {
    const client = this.client(credentials)
    const raw = await client.post<KarrioManifest>('manifests', {
      carrier_id: data.carrierId,
      shipment_identifiers: data.shipmentIds ?? [],
    })
    return transformManifest(raw)
  }
}

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: warehouse — Karrio has no warehouse/location management endpoint;
//              the platform is a carrier-integration layer with no warehouse concept.
