// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: manifest  — Terminal Africa API has no manifest concept or endpoint (confirmed: docs.terminal.africa/tship/sitemap.md)
// Unavailable: order     — Terminal Africa API has no order management concept or endpoint (confirmed: docs.terminal.africa/tship/sitemap.md)
// Unavailable: warehouse — Terminal Africa API has no warehouse concept or endpoint (confirmed: docs.terminal.africa/tship/sitemap.md)

import {
  connectionScope,
  cursorPagerKey,
  pageByRows,
  reportUpstreamPage,
  simpleApiKey,
} from '@opensteward/shared'
import { createHmac, timingSafeEqual } from 'crypto'
import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
  RateRequestParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { Carrier } from '../../schema/carrier'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Label } from '../../schema/label'
import type { WebhookEvent } from '../../schema/webhook'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { TerminalAfricaClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformShipment, type TerminalAfricaShipment } from './transform/shipment'
import { transformRate, type TerminalAfricaRate } from './transform/rate'
import { transformLabel } from './transform/label'
import { transformTrackingEvents, type TerminalAfricaTrackingResponse } from './transform/tracking'
import { transformCarrier, type TerminalAfricaCarrier } from './transform/carrier'
import { transformShipmentEvents } from './transform/trackingevent'

interface TerminalAfricaAdapterConfig {
  clientId?: string
  clientSecret?: string
}

const SIMPLE_API_KEY_FORM = simpleApiKey()

/** Envelope shape returned by most Terminal Africa v1 GET/POST endpoints. */
interface TaEnvelope<T> {
  status: boolean
  message: string
  data: T
}

/**
 * GET /v1/shipments: `data` is the array of shipments and `pageData` its
 * sibling (docs.terminal.africa/tship/shipment/get-shipments).
 */
interface TaShipmentsPage {
  status: boolean
  message: string
  data: TerminalAfricaShipment[]
  pageData?: { total?: number; perPage?: number; page?: number; pageCount?: number }
}

/** `data.pagination` on GET /v1/carriers (only the fields read here). */
interface TaPagination {
  hasNextPage?: boolean
  total?: number
}

export class TerminalAfricaAdapter implements LogisticsAdapter {
  // Connect Link support — single API-key form.
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'terminal-africa'
  readonly version = '1'

  constructor(_config: TerminalAfricaAdapterConfig = {}) {}

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // For Terminal Africa the "code" is the API key itself.
    return exchangeApiKey(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Webhook ────────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    // Terminal Africa signs webhooks with HMAC-SHA512.
    // The digest is hex-encoded and sent in the `X-Terminal-Signature` header.
    const signature = headers['x-terminal-signature'] ?? ''
    const expected = createHmac('sha512', secret).update(payload.toString('utf8')).digest('hex')
    try {
      return timingSafeEqual(Buffer.from(signature, 'utf8'), Buffer.from(expected, 'utf8'))
    } catch {
      return false
    }
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    const eventType = String(payload['event'] ?? '')
    const data = payload['data'] as Record<string, unknown> | undefined

    // eventType examples: "shipment.created", "shipment.updated", "shipment.cancelled",
    //                     "shipment.in-transit", "shipment.delivered",
    //                     "address.created", "address.updated", "address.deleted",
    //                     "transaction.success", "transaction.failed"
    const [resource, rawAction] = eventType.split('.')

    type CanonicalResource = WebhookEvent['resourceType']
    const resourceTypeMap: Record<string, CanonicalResource> = {
      shipment: 'shipment',
      address: 'shipment',
      transaction: 'shipment',
      insurance: 'shipment',
      claim: 'shipment',
      packaging: 'shipment',
      reconciliation: 'shipment',
    }

    const resourceType = resourceTypeMap[resource ?? '']
    if (!resourceType) return []

    type CanonicalAction = WebhookEvent['action']
    const actionMap: Record<string, CanonicalAction> = {
      created: 'created',
      updated: 'updated',
      deleted: 'deleted',
      cancelled: 'cancelled',
      canceled: 'cancelled',
      success: 'updated',
      failed: 'updated',
      'in-transit': 'updated',
      delivered: 'updated',
      flagged: 'updated',
      billed: 'updated',
    }

    const action: CanonicalAction = actionMap[rawAction ?? ''] ?? 'updated'

    const resourceId = data
      ? String(data['shipment_id'] ?? data['id'] ?? data['address_id'] ?? '') || undefined
      : undefined

    return [
      {
        platform: 'terminal-africa',
        type: eventType,
        resourceType,
        action,
        resourceId,
        payload,
      },
    ]
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    // GET /v1/shipments pages by `page` (1-based) + `perPage` and answers a
    // bare `data` array beside `pageData: { total, perPage, page, pageCount }`
    // (docs.terminal.africa/tship/shipment/get-shipments). No maximum perPage
    // is documented; the adapter's cap is the documented default of 100, and
    // is reported as the page size served.
    const client = new TerminalAfricaClient(credentials)
    const perPage = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const page = params.page ?? 1
    const res = await client.get<TaShipmentsPage>('shipments', { page, perPage })
    const pageData = res.pageData
    reportUpstreamPage(params, {
      ...(typeof pageData?.pageCount === 'number' ? { hasMore: page < pageData.pageCount } : {}),
      ...(typeof pageData?.total === 'number' ? { totalCount: pageData.total } : {}),
      pageSize: perPage,
    })
    return (Array.isArray(res.data) ? res.data : []).map(transformShipment)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new TerminalAfricaClient(credentials)
    const res = await client.get<TaEnvelope<TerminalAfricaShipment>>(`shipments/${id}`)
    return transformShipment(res.data)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new TerminalAfricaClient(credentials)
    // Terminal Africa requires address IDs; if metadata contains them, use them.
    // Otherwise pass through what we have as metadata.
    const meta = data.metadata as Record<string, unknown> | undefined
    const res = await client.post<TaEnvelope<TerminalAfricaShipment>>('shipments', {
      address_from: meta?.['address_from_id'] ?? undefined,
      address_to: meta?.['address_to_id'] ?? undefined,
      parcel: meta?.['parcel_id'] ?? undefined,
      shipment_purpose: meta?.['shipment_purpose'] ?? 'personal',
      metadata: meta ?? undefined,
    })
    return transformShipment(res.data)
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new TerminalAfricaClient(credentials)
    await client.post<TaEnvelope<TerminalAfricaShipment>>('shipments/cancel', {
      shipment_id: id,
    })
  }

  // ── Carriers ───────────────────────────────────────────────────────────────

  async listCarriers(credentials: Credentials, params: QueryParams): Promise<Carrier[]> {
    const client = new TerminalAfricaClient(credentials)
    // GET /v1/carriers pages by `page` (1-based) + `perPage`, and answers
    // `data.pagination.hasNextPage` (docs.terminal.africa/tship/carrier/get-carriers).
    const perPage = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<
      TaEnvelope<{ carriers: TerminalAfricaCarrier[]; pagination?: TaPagination }>
    >('carriers', {
      perPage,
      page: params.page ?? 1,
    })
    const pagination = res.data?.pagination
    // pageSize is reported unconditionally: the cap can serve fewer rows than
    // the caller asked for, and a full capped page must not read as short.
    reportUpstreamPage(params, {
      ...(typeof pagination?.hasNextPage === 'boolean' ? { hasMore: pagination.hasNextPage } : {}),
      ...(typeof pagination?.total === 'number' ? { totalCount: pagination.total } : {}),
      pageSize: perPage,
    })
    return (res.data?.carriers ?? []).map(transformCarrier)
  }

  async getCarrier(credentials: Credentials, id: string): Promise<Carrier> {
    const client = new TerminalAfricaClient(credentials)
    const res = await client.get<TaEnvelope<TerminalAfricaCarrier>>(`carriers/${id}`)
    return transformCarrier(res.data)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, shipmentId: string): Promise<TrackingEvent[]> {
    const client = new TerminalAfricaClient(credentials)
    const res = await client.get<TaEnvelope<TerminalAfricaTrackingResponse>>(
      `shipments/track/${shipmentId}`,
    )
    return transformTrackingEvents(res.data)
  }

  async listTrackingEvents(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<TrackingEvent[]> {
    // There is no event collection: every v1 shipment object carries its
    // `events` (docs.terminal.africa/tship/miscallaneous/shipment-event), so
    // the events are flattened out of GET /v1/shipments pages. One page of
    // shipments is not one page of events, so pageByRows cuts the caller's
    // rows out of the walk, at a fixed upstream perPage.
    const client = new TerminalAfricaClient(credentials)
    const perPage = MAX_PAGE_SIZE
    const key = cursorPagerKey(connectionScope('terminal-africa', credentials), 'tracking-events', {
      perPage,
    })
    const result = await pageByRows<TrackingEvent, number>(key, params, async (cursor) => {
      const page = cursor ?? 1
      const res = await client.get<TaShipmentsPage>('shipments', { page, perPage })
      const shipments = Array.isArray(res.data) ? res.data : []
      const pageCount = res.pageData?.pageCount
      const items = shipments.flatMap(transformShipmentEvents)
      if (typeof pageCount === 'number')
        return { items, next: page < pageCount ? page + 1 : undefined }
      // An empty page is past the end whatever pageData says; a non-empty one
      // without pageData gives no way to know whether another page follows.
      if (shipments.length === 0) return { items, next: undefined }
      throw new Error('Terminal Africa GET /v1/shipments answered without pageData.pageCount')
    })
    return result.items
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new TerminalAfricaClient(credentials)
    // Terminal Africa rates endpoint requires address IDs; pass through from params.metadata
    const meta = params as Record<string, unknown>
    const res = await client.post<
      TaEnvelope<{ rates?: TerminalAfricaRate[] } | TerminalAfricaRate[]>
    >('rates/multi/shipment', {
      pickup_address: meta['address_from_id'] ?? undefined,
      delivery_address: meta['address_to_id'] ?? undefined,
      parcels: meta['parcel_ids'] ?? undefined,
      currency: meta['currency'] ?? 'NGN',
    })
    // Response may be envelope { data: { rates: [] } } or { data: [] }
    const raw = res.data
    const list = Array.isArray(raw) ? raw : ((raw as { rates?: TerminalAfricaRate[] }).rates ?? [])
    return list.map(transformRate)
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    const client = new TerminalAfricaClient(credentials)
    const res = await client.get<TaEnvelope<TerminalAfricaShipment>>(`shipments/${id}`)
    const shipment = res.data
    const labelUrl = shipment.extras?.label_url ?? undefined

    if (!labelUrl) {
      throw new Error(`No label found on shipment ${id}`)
    }
    return transformLabel(shipment, labelUrl)
  }

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    if (!data.shipmentId)
      throw new Error('shipmentId is required to arrange pickup / create a label')
    const client = new TerminalAfricaClient(credentials)
    const meta = data.metadata as Record<string, unknown> | undefined

    // Arrange pickup + delivery which generates the label on Terminal Africa
    const res = await client.post<TaEnvelope<TerminalAfricaShipment>>('shipments/pickup', {
      shipment_id: data.shipmentId,
      rate_id: meta?.['rate_id'] ?? undefined,
      purchase_insurance: meta?.['purchase_insurance'] ?? false,
    })
    const shipment = res.data
    const labelUrl = shipment.extras?.label_url ?? undefined

    if (!labelUrl) {
      throw new Error(`Label arrange did not return a label_url for shipment ${data.shipmentId}`)
    }
    return transformLabel(shipment, labelUrl)
  }

  async voidLabel(credentials: Credentials, id: string): Promise<void> {
    // Terminal Africa cancels the shipment to void the label
    await this.cancelShipment(credentials, id)
  }
}
