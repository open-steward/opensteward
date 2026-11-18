import {
  connectionScope,
  cursorPagerKey,
  customForm,
  pageByRows,
  pageLocally,
} from '@opensteward/shared'
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

import { buildAuthUrl, exchangeClientCredentials, refreshCredentials as doRefresh } from './auth'
import { SkydropxClient } from './client'
import { CARRIER_SERVICES_MAX_PAGES, CARRIER_SERVICES_MAX_PER_PAGE } from './constants'

import {
  shipmentPackages,
  transformShipment,
  type SkydropxShipmentResponse,
  type SkydropxShipmentsListResponse,
} from './transform/shipment'
import { transformQuotationRate, type SkydropxQuotationRate } from './transform/rate'
import {
  transformLabel,
  transformPackageLabel,
  type SkydropxLabelResponse,
} from './transform/label'
import { transformTrackingEvent, type SkydropxTrackingResponse } from './transform/tracking'
import {
  groupCarrierServices,
  type SkydropxCarrierService,
  type SkydropxCarrierServicesResponse,
} from './transform/carrier'

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: manifest  — Skydropx API has no manifest/end-of-day endpoint (docs.skydropx.com)
// Unavailable: order     — orders appear only as attributes on shipments, not a standalone resource
// Unavailable: warehouse — Skydropx API has no warehouse management endpoint

/** Every method below targets the PRO API; see constants.ts for the host and auth evidence. */
const DOCS = 'https://pro.skydropx.com/es-MX/api-docs'

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

/** Pager scope for one connection's rows (see connectionScope). */
function scope(credentials: Credentials): string {
  return connectionScope('skydropx', credentials)
}

// Connect Link: the PRO API authenticates with a client ID and secret
// exchanged for a bearer token (POST /api/v1/oauth/token, client_credentials).
const CREDENTIAL_FORM = customForm({
  fields: [
    {
      name: 'clientId',
      label: 'Client ID',
      type: 'text',
      required: true,
      helpText: 'Skydropx PRO: Conexiones > API.',
    },
    { name: 'clientSecret', label: 'Client Secret', type: 'password', required: true },
  ],
  exchange: (input) =>
    exchangeClientCredentials((input['clientId'] ?? '').trim(), input['clientSecret'] ?? ''),
})

interface SkydropxAdapterConfig {
  clientId?: string
  clientSecret?: string
}

export class SkydropxAdapter implements LogisticsAdapter {
  // Connect Link support — client ID + client secret form.
  credentialFields = CREDENTIAL_FORM.credentialFields
  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  readonly platform = 'skydropx'
  readonly version = '1'

  private clientId: string
  private clientSecret: string

  constructor(config: SkydropxAdapterConfig = {}) {
    this.clientId = config.clientId ?? ''
    this.clientSecret = config.clientSecret ?? ''
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // Skydropx PRO has no authorization-code flow. A "code" of
    // "clientId:clientSecret" is exchanged by client credentials; otherwise
    // the adapter's configured client is used.
    const [id, ...rest] = code.split(':')
    const secret = rest.join(':')
    if (id && secret) return exchangeClientCredentials(id, secret)
    return exchangeClientCredentials(this.clientId, this.clientSecret)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────
  // Skydropx Radar sends webhook notifications but does NOT document a signing
  // mechanism (no HMAC header). verifyWebhook therefore always returns true
  // (callers must use network-level security). parseWebhookEvents maps the
  // known status values to canonical resource/action pairs.

  verifyWebhook(_payload: Buffer, _headers: Record<string, string>, _secret: string): boolean {
    // No documented signing scheme — accept all (rely on IP allowlisting etc.)
    return true
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    // Radar webhook payload: { type, action, timestamp, data: { id, carrier, status, tracking_number } }
    const data = payload['data'] as Record<string, unknown> | undefined
    const resourceId = data ? String(data['id'] ?? '') : undefined
    const rawStatus = String(data?.['status'] ?? payload['action'] ?? '')

    type CanonicalAction = WebhookEvent['action']
    const actionMap: Record<string, CanonicalAction> = {
      SHIPMENT_CREATED: 'created',
      SHIPMENT_UPDATED: 'updated',
      SHIPMENT_DELIVERED: 'updated',
      SHIPMENT_CANCELLED: 'cancelled',
      SHIPMENT_EXCEPTION: 'updated',
    }
    const action: CanonicalAction = actionMap[rawStatus] ?? 'updated'

    return [
      {
        platform: 'skydropx',
        type: String(payload['action'] ?? payload['type'] ?? 'shipment.updated'),
        resourceType: 'tracking_event',
        action,
        resourceId: resourceId || undefined,
        payload,
      },
    ]
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  /**
   * One upstream page of GET /api/v1/shipments. The endpoint documents only
   * `page` ("Número de página a obtener") and `ids`, pages "de diez en diez"
   * (a fixed 10 rows; there is no per_page), and returns `meta.next_page`,
   * null on the last page.
   */
  private async shipmentsPage(
    client: SkydropxClient,
    page: number,
  ): Promise<{ res: SkydropxShipmentsListResponse; next: number | null }> {
    const res = await client.get<SkydropxShipmentsListResponse>('shipments', { page })
    const next = res.meta?.next_page
    const rows = res.data ?? []
    return {
      res,
      next: rows.length > 0 && typeof next === 'number' && next > page ? next : null,
    }
  }

  /**
   * GET /api/v1/shipments ("Recupera todos los envíos"). Upstream pages are a
   * fixed 10 rows, so the caller's page and limit are cut from them with
   * pageByRows, which reports `hasMore` from `meta.next_page`.
   */
  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new SkydropxClient(credentials)
    const key = cursorPagerKey(scope(credentials), 'shipments', {})
    const { items } = await pageByRows<Shipment, number>(key, params, async (page = 1) => {
      const { res, next } = await this.shipmentsPage(client, page)
      const included = res.included ?? []
      return { items: (res.data ?? []).map((s) => transformShipment(s, included)), next }
    })
    return items
  }

  /** GET /api/v1/shipments/{id} ("Recupera un envío"). */
  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new SkydropxClient(credentials)
    const res = await client.get<SkydropxShipmentResponse>(`shipments/${encodeURIComponent(id)}`)
    if (!res.data) throw new Error(`Shipment ${id} not found`)
    return transformShipment(res.data, res.included ?? [])
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new SkydropxClient(credentials)
    const body: Record<string, unknown> = {}

    if (data.originAddress) {
      body['address_from'] = {
        name: data.originAddress.name,
        company: data.originAddress.company,
        address1: data.originAddress.street1,
        address2: data.originAddress.street2,
        city: data.originAddress.city,
        province: data.originAddress.state,
        zip: data.originAddress.postalCode,
        country: data.originAddress.country ?? 'MX',
        phone: data.originAddress.phone,
        email: data.originAddress.email,
      }
    }

    if (data.destinationAddress) {
      body['address_to'] = {
        name: data.destinationAddress.name,
        company: data.destinationAddress.company,
        address1: data.destinationAddress.street1,
        address2: data.destinationAddress.street2,
        city: data.destinationAddress.city,
        province: data.destinationAddress.state,
        zip: data.destinationAddress.postalCode,
        country: data.destinationAddress.country ?? 'MX',
        phone: data.destinationAddress.phone,
        email: data.destinationAddress.email,
      }
    }

    if (data.totalWeight) {
      body['parcels'] = [
        {
          weight: data.totalWeight.value,
          mass_unit: data.totalWeight.unit.toUpperCase(),
          distance_unit: 'CM',
          height: data.dimensions?.height ?? 1,
          width: data.dimensions?.width ?? 1,
          length: data.dimensions?.length ?? 1,
        },
      ]
    }

    const res = await client.post<SkydropxShipmentResponse>('shipments', body)
    if (!res.data) throw new Error('createShipment did not return data')
    return transformShipment(res.data, res.included ?? [])
  }

  // ── Carriers ───────────────────────────────────────────────────────────────

  /**
   * GET /api/v1/shipments/carrier_services: "Este endpoint obtiene todos los
   * servicios de transportadora disponibles", paged by `page` and `per_page`
   * ("máx 20, por defecto 20") with `meta.next_page`. It lists SERVICES, one
   * row per carrier service, so one Carrier per `carrier_name` needs the whole
   * catalogue: a carrier's services may straddle upstream pages. The walk
   * fetches every page, groups, and pages the carriers locally.
   */
  async listCarriers(credentials: Credentials, params: QueryParams): Promise<Carrier[]> {
    const client = new SkydropxClient(credentials)
    const rows: SkydropxCarrierService[] = []
    let page = 1
    for (let fetched = 0; ; fetched++) {
      if (fetched >= CARRIER_SERVICES_MAX_PAGES)
        throw new Error(
          `Skydropx carrier_services did not end within ${CARRIER_SERVICES_MAX_PAGES} pages`,
        )
      const res = await client.get<SkydropxCarrierServicesResponse>('shipments/carrier_services', {
        page,
        per_page: CARRIER_SERVICES_MAX_PER_PAGE,
      })
      const data = res.data ?? []
      rows.push(...data)
      const next = res.meta?.next_page
      if (data.length === 0 || typeof next !== 'number' || next <= page) break
      page = next
    }
    return pageLocally(groupCarrierServices(rows), params)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  /**
   * Refused. The PRO API has no tracking-event collection: the only events
   * endpoint is a lookup, GET /api/v1/shipments/tracking with tracking_number
   * and carrier_name both "Required", and a shipment's packages carry only a
   * current `tracking_status` ("Estado de seguimiento"), not an event history.
   */
  async listTrackingEvents(
    _credentials: Credentials,
    _params: QueryParams,
  ): Promise<TrackingEvent[]> {
    throw notSupported(
      'Skydropx cannot list tracking events: the PRO API documents only a per-shipment lookup, ' +
        'GET /api/v1/shipments/tracking?tracking_number={tracking_number}&carrier_name={carrier_name} ' +
        '(both "Required"), and shipments carry only a current tracking_status. ' +
        `Use GET /tracking/:trackingNumber with a carrier. (${DOCS})`,
    )
  }

  /**
   * GET /api/v1/shipments/tracking?tracking_number=…&carrier_name=… ("Rastrea
   * un envío", "Retorna la lista de los eventos ocurridos"). Both parameters
   * are documented as required, so a call without a carrier is refused
   * before any request. A 404 is documented as "Este número de guía no cuenta
   * con eventos de rastreo" and reads as no events.
   */
  async getTrackingEvents(
    credentials: Credentials,
    trackingNumber: string,
    carrier?: string,
  ): Promise<TrackingEvent[]> {
    if (!carrier) {
      throw notSupported(
        'Skydropx tracking needs the carrier: GET /api/v1/shipments/tracking requires both ' +
          'tracking_number and carrier_name ("Required"). Pass the carrier name (for example "fedex").',
      )
    }
    const client = new SkydropxClient(credentials)
    try {
      const res = await client.get<SkydropxTrackingResponse>('shipments/tracking', {
        tracking_number: trackingNumber,
        carrier_name: carrier,
      })
      return (res.data ?? []).map((e) => transformTrackingEvent(e, trackingNumber, carrier))
    } catch (err) {
      if ((err as { response?: { status?: number } }).response?.status === 404) return []
      throw err
    }
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new SkydropxClient(credentials)
    const pkg = params.packages[0]
    const res = await client.post<SkydropxQuotationRate[]>('quotations', {
      zip_from: params.originAddress.postalCode ?? '',
      zip_to: params.destinationAddress.postalCode ?? '',
      parcel: {
        weight: pkg?.weight?.value ?? 1,
        height: pkg?.dimensions?.height ?? 1,
        width: pkg?.dimensions?.width ?? 1,
        length: pkg?.dimensions?.length ?? 1,
      },
    })
    return (Array.isArray(res) ? res : []).map(transformQuotationRate)
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  /**
   * Labels read out of GET /api/v1/shipments. The API has no label collection
   * (labels otherwise hang off one order, GET /api/v1/orders/{order_id}/labels),
   * but every shipment page includes its packages, and a package's `label_url`
   * is "URL de la guía". Packages with a hosted label are flattened in stream
   * order and cut to the caller's page with pageByRows over the 10-row
   * shipment pages, so `hasMore` comes from `meta.next_page`.
   */
  async listLabels(credentials: Credentials, params: QueryParams): Promise<Label[]> {
    const client = new SkydropxClient(credentials)
    const key = cursorPagerKey(scope(credentials), 'labels', {})
    const { items } = await pageByRows<Label, number>(key, params, async (page = 1) => {
      const { res, next } = await this.shipmentsPage(client, page)
      const included = res.included ?? []
      const labels = (res.data ?? []).flatMap((s) =>
        shipmentPackages(s, included)
          .map((p) => transformPackageLabel(p, s))
          .filter((l): l is Label => l !== undefined),
      )
      return { items: labels, next }
    })
    return items
  }

  /**
   * Refused. The PRO API documents no label lookup by id: a label exists only
   * as a package's `label_url` inside a shipment, or among an order's
   * `label_urls` (GET /api/v1/orders/{order_id}/labels).
   */
  async getLabel(_credentials: Credentials, _id: string): Promise<Label> {
    throw notSupported(
      'Skydropx cannot read a label by id: the PRO API has no label endpoint; labels appear only as ' +
        'package label_url fields on GET /api/v1/shipments/{id} and as label_urls on ' +
        `GET /api/v1/orders/{order_id}/labels. (${DOCS})`,
    )
  }

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    const rateId = (data.metadata as Record<string, unknown> | undefined)?.rate_id
    if (!rateId) throw new Error('rate_id is required in metadata to create a Skydropx label')
    const client = new SkydropxClient(credentials)
    const res = await client.post<SkydropxLabelResponse>('labels', {
      rate_id: rateId,
      label_format: 'pdf',
    })
    if (!res.data) throw new Error('createLabel did not return data')
    return transformLabel(res.data)
  }

  async voidLabel(credentials: Credentials, id: string): Promise<void> {
    // Skydropx uses cancel_label_requests — POST with the tracking number.
    // We first retrieve the label to get the tracking number.
    const client = new SkydropxClient(credentials)
    const res = await client.get<SkydropxLabelResponse>(`labels/${id}`)
    const trackingNumber = res.data?.attributes?.tracking_number
    if (!trackingNumber) throw new Error(`Cannot void label ${id}: no tracking_number found`)
    await client.post<unknown>('cancel_label_requests', {
      tracking_number: trackingNumber,
      reason: 'Voided via API',
    })
  }
}
