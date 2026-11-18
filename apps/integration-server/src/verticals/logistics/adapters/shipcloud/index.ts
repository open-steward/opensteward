import {
  connectionScope,
  cursorPagerKey,
  pageByRows,
  pageLocally,
  simpleApiKey,
} from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
  RateRequestParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Label } from '../../schema/label'
import type { Carrier } from '../../schema/carrier'
import type { Manifest } from '../../schema/manifest'
import type { Order } from '../../schema/order'
import type { WebhookEvent } from '../../schema/webhook'

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: warehouse — shipcloud API has no warehouse/fulfilment-centre concept; not present in v1 reference

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { ShipcloudClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformShipment, type ShipcloudShipment } from './transform/shipment'
import { transformTrackingEvents } from './transform/tracking'
import { transformRate, type ShipcloudQuote } from './transform/rate'
import { transformLabel } from './transform/label'
import { transformCarrier, type ShipcloudCarrier } from './transform/carrier'
import { transformManifest, type ShipcloudManifest } from './transform/manifest'
import { transformOrder, type ShipcloudOrder } from './transform/order'

interface ShipcloudAdapterConfig {
  clientId?: string
  clientSecret?: string
  redirectUri?: string
  scopes?: string[]
}

const SIMPLE_API_KEY_FORM = simpleApiKey()

/**
 * Pager scope for one connection. shipcloud identifies an account only by its
 * API key, so the scope is the key's fingerprint (never the key itself).
 */
function shipcloudScope(credentials: Credentials): string {
  return connectionScope('shipcloud', credentials)
}

/**
 * One upstream page of GET /v1/shipments. The reference documents
 * `page` ("show page number x") and `per_page` ("default & max: 100") and no
 * next-page signal, so a page shorter than `per_page` is the last one.
 */
async function fetchShipmentsPage(
  client: ShipcloudClient,
  page: number,
  perPage: number,
): Promise<{ shipments: ShipcloudShipment[]; next: number | undefined }> {
  const res = await client.get<{ shipments: ShipcloudShipment[] }>('shipments', {
    page,
    per_page: perPage,
  })
  const shipments = res.shipments ?? []
  return { shipments, next: shipments.length < perPage ? undefined : page + 1 }
}

export class ShipcloudAdapter implements LogisticsAdapter {
  // Connect Link support — single API-key form.
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'shipcloud'
  readonly version = '1'

  constructor(_config: ShipcloudAdapterConfig = {}) {}

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // For shipcloud the "code" is the API key itself.
    return exchangeApiKey(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Webhook ────────────────────────────────────────────────────────────────

  /**
   * shipcloud webhooks are optionally secured via HTTP Basic Auth on the
   * receiving endpoint — they do NOT use HMAC signatures. Therefore
   * verifyWebhook always returns true (rely on the caller to authenticate
   * at the network/HTTP layer).
   */
  verifyWebhook(_payload: Buffer, _headers: Record<string, string>, _secret: string): boolean {
    // No HMAC signing — shipcloud webhook security is basic auth on the endpoint
    return true
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    // shipcloud webhook payload structure:
    // { type: "shipment.tracking.transit", data: { id, carrier_tracking_no, ... } }
    const type = String(payload['type'] ?? '')
    const data = payload['data'] as Record<string, unknown> | undefined

    if (!type) return []

    const resourceId = data ? String(data['id'] ?? '') : undefined

    // Map shipcloud event type to canonical resource type + action
    // Examples: "shipment.tracking.delivered", "shipment.tracking.transit"
    type CanonicalResource = WebhookEvent['resourceType']
    type CanonicalAction = WebhookEvent['action']

    let resourceType: CanonicalResource
    let action: CanonicalAction

    if (type.startsWith('shipment.tracking.')) {
      resourceType = 'tracking_event'
      action = 'updated'
    } else if (type.startsWith('shipment.')) {
      resourceType = 'shipment'
      const suffix = type.split('.').pop() ?? ''
      const actionMap: Record<string, CanonicalAction> = {
        created: 'created',
        updated: 'updated',
        deleted: 'deleted',
        cancelled: 'cancelled',
      }
      action = actionMap[suffix] ?? 'updated'
    } else {
      return []
    }

    return [
      {
        platform: 'shipcloud',
        type,
        resourceType,
        action,
        resourceId: resourceId || undefined,
        payload,
      },
    ]
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new ShipcloudClient(credentials)
    // Upstream pages of the caller's size (at most shipcloud's 100); pageByRows
    // cuts the caller's rows out of them, so a limit above 100 still serves
    // exactly `limit` rows, and peeks at a page boundary so hasMore is exact.
    const perPage = Math.min(
      Math.max(Math.floor(params.limit ?? DEFAULT_PAGE_SIZE), 1),
      MAX_PAGE_SIZE,
    )
    const key = cursorPagerKey(shipcloudScope(credentials), 'shipments', { per_page: perPage })
    const { items } = await pageByRows<Shipment, number>(
      key,
      params,
      async (cursor) => {
        const { shipments, next } = await fetchShipmentsPage(client, cursor ?? 1, perPage)
        return { items: shipments.map(transformShipment), next }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return items
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new ShipcloudClient(credentials)
    const raw = await client.get<ShipcloudShipment>(`shipments/${id}`)
    return transformShipment(raw)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new ShipcloudClient(credentials)

    const body: Record<string, unknown> = {
      carrier: data.carrierId,
      service: data.serviceCode ?? 'standard',
      create_shipping_label: true,
    }

    if (data.reference) {
      body['reference_number'] = data.reference
    }

    if (data.destinationAddress) {
      const addr = data.destinationAddress
      const nameParts = (addr.name ?? '').split(' ')
      body['to'] = {
        first_name: nameParts[0] ?? undefined,
        last_name: nameParts.slice(1).join(' ') || undefined,
        company: addr.company ?? undefined,
        street: addr.street1 ?? undefined,
        city: addr.city ?? undefined,
        zip_code: addr.postalCode ?? undefined,
        country: addr.country ?? undefined,
        phone: addr.phone ?? undefined,
        email: addr.email ?? undefined,
      }
    }

    if (data.originAddress) {
      const addr = data.originAddress
      const nameParts = (addr.name ?? '').split(' ')
      body['from'] = {
        first_name: nameParts[0] ?? undefined,
        last_name: nameParts.slice(1).join(' ') || undefined,
        company: addr.company ?? undefined,
        street: addr.street1 ?? undefined,
        city: addr.city ?? undefined,
        zip_code: addr.postalCode ?? undefined,
        country: addr.country ?? undefined,
        phone: addr.phone ?? undefined,
        email: addr.email ?? undefined,
      }
    }

    if (data.totalWeight || data.dimensions) {
      body['package'] = {
        weight: data.totalWeight?.value ?? 1,
        length: data.dimensions?.length ?? undefined,
        width: data.dimensions?.width ?? undefined,
        height: data.dimensions?.height ?? undefined,
      }
    }

    const raw = await client.post<ShipcloudShipment>('shipments', body)
    return transformShipment(raw)
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new ShipcloudClient(credentials)
    await client.delete(`shipments/${id}`)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new ShipcloudClient(credentials)
    // Search shipments by carrier_tracking_no
    const res = await client.get<{ shipments: ShipcloudShipment[] }>('shipments', {
      carrier_tracking_no: trackingNumber,
    })
    const shipments = res.shipments ?? []
    if (shipments.length === 0) return []
    return shipments.flatMap(transformTrackingEvents)
  }

  async listTrackingEvents(credentials: Credentials, params: QueryParams): Promise<TrackingEvent[]> {
    const client = new ShipcloudClient(credentials)
    // Events are flattened out of pages of shipments, so one upstream page is
    // not one caller page: read shipments at the documented maximum of 100 and
    // cut the caller's events out of the stream. A page of shipments with no
    // events is legitimately empty, hence the upstream-page budget.
    const key = cursorPagerKey(shipcloudScope(credentials), 'shipments:tracking-events', {
      per_page: MAX_PAGE_SIZE,
    })
    const { items } = await pageByRows<TrackingEvent, number>(
      key,
      params,
      async (cursor) => {
        const { shipments, next } = await fetchShipmentsPage(client, cursor ?? 1, MAX_PAGE_SIZE)
        return { items: shipments.flatMap(transformTrackingEvents), next }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return items
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new ShipcloudClient(credentials)

    const toAddr = params.destinationAddress
    const fromAddr = params.originAddress
    const firstPkg = params.packages[0]

    const body: Record<string, unknown> = {
      shipment_quote: {
        carrier: (params as Record<string, unknown>)['carrierId'] ?? 'dhl',
        service: (params as Record<string, unknown>)['serviceCode'] ?? 'standard',
        to: {
          zip_code: toAddr.postalCode ?? undefined,
          country: toAddr.country ?? undefined,
          city: toAddr.city ?? undefined,
        },
        from: {
          zip_code: fromAddr.postalCode ?? undefined,
          country: fromAddr.country ?? undefined,
          city: fromAddr.city ?? undefined,
        },
        package: {
          weight: firstPkg?.weight?.value ?? 1,
          length: firstPkg?.dimensions?.length ?? undefined,
          width: firstPkg?.dimensions?.width ?? undefined,
          height: firstPkg?.dimensions?.height ?? undefined,
        },
      },
    }

    const res = await client.post<{ shipment_quote: ShipcloudQuote }>('shipment_quotes', body)
    const quote = res.shipment_quote
    if (!quote) return []
    return [transformRate(quote)]
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    // Labels in shipcloud live on the shipment; id is the shipment id
    const client = new ShipcloudClient(credentials)
    const raw = await client.get<ShipcloudShipment>(`shipments/${id}`)
    if (!raw.label_url) {
      throw new Error(`No label found on shipment ${id}`)
    }
    return transformLabel(raw)
  }

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    if (!data.shipmentId) throw new Error('shipmentId is required to create a label')
    // shipcloud creates labels as part of shipment creation (create_shipping_label: true)
    // Re-fetching the shipment returns the label URL
    const client = new ShipcloudClient(credentials)
    const raw = await client.get<ShipcloudShipment>(`shipments/${data.shipmentId}`)
    return transformLabel(raw)
  }

  async voidLabel(credentials: Credentials, id: string): Promise<void> {
    // Deleting a shipment in shipcloud also voids the label
    const client = new ShipcloudClient(credentials)
    await client.delete(`shipments/${id}`)
  }

  // ── Carriers ───────────────────────────────────────────────────────────────

  async listCarriers(credentials: Credentials, params: QueryParams): Promise<Carrier[]> {
    const client = new ShipcloudClient(credentials)
    // GET /carriers returns a plain array, not a keyed object. It takes no
    // paging parameters and returns every carrier on the account, so the
    // caller's page is sliced from the whole list.
    const res = await client.get<ShipcloudCarrier[]>('carriers')
    return pageLocally((Array.isArray(res) ? res : []).map(transformCarrier), params)
  }

  // ── Manifests ─────────────────────────────────────────────────────────────

  // The first-party OpenAPI spec declares "/manifests" with only
  // { "post": "Create a manifest" } and "/manifests/{id}" with
  // { "get": "Getting information about a manifest" }: there is no list.
  async listManifests(_credentials: Credentials, _params: QueryParams): Promise<Manifest[]> {
    throw Object.assign(
      new Error(
        'shipcloud cannot list manifests: the API documents only POST /manifests ("Create a manifest") and GET /manifests/{id} ("Getting information about a manifest")',
      ),
      { statusCode: 501, code: 'NOT_SUPPORTED' },
    )
  }

  async getManifest(credentials: Credentials, id: string): Promise<Manifest> {
    const client = new ShipcloudClient(credentials)
    const raw = await client.get<ShipcloudManifest>(`manifests/${id}`)
    return transformManifest(raw)
  }

  async createManifest(credentials: Credentials, data: Partial<Manifest>): Promise<Manifest> {
    const client = new ShipcloudClient(credentials)
    const body: Record<string, unknown> = {}
    if (data.carrierId) body['carrier'] = data.carrierId
    if (data.shipmentIds && data.shipmentIds.length > 0) {
      body['shipment_ids'] = data.shipmentIds
    }
    const raw = await client.post<ShipcloudManifest>('manifests', body)
    return transformManifest(raw)
  }

  // ── Orders ─────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new ShipcloudClient(credentials)
    // GET /v1/orders returns a raw JSON array (no envelope key). The reference
    // and OpenAPI spec document only filters on it (external_order_id,
    // external_customer_id, created_at_gt/lt), no page or per_page, so the
    // caller's page is sliced from the whole list.
    const res = await client.get<ShipcloudOrder[]>('orders')
    return pageLocally((Array.isArray(res) ? res : []).map(transformOrder), params)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new ShipcloudClient(credentials)
    const raw = await client.get<ShipcloudOrder>(`orders/${id}`)
    return transformOrder(raw)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new ShipcloudClient(credentials)

    const body: Record<string, unknown> = {}

    if (data.orderAt) body['placed_at'] = (data.orderAt as Date).toISOString()
    if (data.orderNumber) body['external_order_id'] = data.orderNumber
    if (data.customerId) body['external_customer_id'] = data.customerId
    if (data.currency) body['currency'] = data.currency

    if (data.totalAmount != null) body['total_price'] = data.totalAmount
    if (data.taxAmount != null) body['total_vat'] = data.taxAmount

    if (data.destinationAddress) {
      const addr = data.destinationAddress
      const nameParts = (addr.name ?? '').split(' ')
      body['delivery_address'] = {
        first_name: nameParts[0] ?? undefined,
        last_name: nameParts.slice(1).join(' ') || undefined,
        company: addr.company ?? undefined,
        street: addr.street1 ?? undefined,
        city: addr.city ?? undefined,
        zip_code: addr.postalCode ?? undefined,
        country: addr.country ?? undefined,
      }
    }

    if (data.lineItems && data.lineItems.length > 0) {
      body['order_line_items'] = data.lineItems.map((li) => ({
        sku: li.sku ?? undefined,
        title: li.name ?? undefined,
        quantity: li.quantity ?? undefined,
        price: li.unitAmount ?? undefined,
        currency: data.currency ?? undefined,
      }))
    }

    const raw = await client.post<ShipcloudOrder>('orders', body)
    return transformOrder(raw)
  }
}
