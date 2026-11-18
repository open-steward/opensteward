import {
  connectionScope,
  cursorPagerKey,
  pageByRows,
  pageLocally,
  reportUpstreamPage,
  simpleApiKey,
} from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
  RateRequestParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { Carrier } from '../../schema/carrier'
import type { Warehouse } from '../../schema/warehouse'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Label } from '../../schema/label'
import type { Manifest } from '../../schema/manifest'
import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { ShipEngineClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { verifyWebhook, parseWebhookEvents } from './webhook'

import { transformShipment, type ShipEngineShipment } from './transform/shipment'
import { transformRate, type ShipEngineRate } from './transform/rate'
import { transformLabel, type ShipEngineLabel } from './transform/label'
import {
  transformTrackingInformation,
  type ShipEngineTrackingInformation,
} from './transform/tracking'
import { transformCarrier, type ShipEngineCarrier } from './transform/carrier'
import { transformWarehouse, type ShipEngineWarehouse } from './transform/warehouse'
import { transformManifest, type ShipEngineManifest } from './transform/manifest'

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: order — ShipEngine v1 REST API has no /orders endpoint;
//              order data is only referenced via external_order_id on shipments/labels.

interface ShipEngineAdapterConfig {
  // Reserved for future use (e.g. partner API key)
  partnerKey?: string
}

const SIMPLE_API_KEY_FORM = simpleApiKey()

/**
 * The paging envelope of ShipEngine's paged lists (/shipments, /labels,
 * /manifests). Per the ShipEngine OpenAPI spec, `page` is "Return a specific
 * page of results. Defaults to the first page." and `page_size` is "The
 * number of results to return per response." (default 25, no maximum
 * documented); each answer carries `total`, `page` and `pages` ("The total
 * number of pages of results").
 */
interface ShipEnginePage {
  total?: number
  page?: number
  pages?: number
}

/**
 * The page_size sent for a caller's limit. ShipEngine documents no maximum;
 * MAX_PAGE_SIZE mirrors the router's global cap, so it only bites on a direct
 * call past it, which then pages at MAX_PAGE_SIZE and reports that size.
 */
function sizeFor(params: QueryParams): number {
  return Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
}

/** Report one page of a ShipEngine paged list: next page exists while page < pages. */
function reportPage(params: QueryParams, res: ShipEnginePage, page: number, size: number): void {
  reportUpstreamPage(params, {
    hasMore: typeof res.pages === 'number' ? page < res.pages : undefined,
    totalCount: typeof res.total === 'number' ? res.total : undefined,
    pageSize: size,
  })
}

/** Shipments per upstream page when walking them for tracking events (ShipEngine's default). */
const TRACKING_SHIPMENT_PAGE_SIZE = 25
/** Upstream shipment pages one caller page of tracking events may walk. */
const TRACKING_MAX_UPSTREAM_PAGES = 40

/**
 * ShipEngineAdapter implements LogisticsAdapter against the ShipEngine v1 REST API.
 *
 * Authentication: API key sent in the `API-Key` request header.
 * Base URL: https://api.shipengine.com/v1
 *
 * Webhook signature: ShipEngine signs webhooks using RSA-SHA256.
 * Headers: x-shipengine-rsa-sha256-signature, x-shipengine-rsa-sha256-key-id,
 * x-shipengine-timestamp. The signed payload is "<timestamp>.<rawBody>".
 * Pass the RSA public key PEM (from https://api.shipengine.com/jwks) as the
 * `secret` parameter to verifyWebhook.
 */
export class ShipEngineAdapter implements LogisticsAdapter {
  // Connect Link support — single API-key form.
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'shipengine'
  readonly version = '1'

  constructor(_config: ShipEngineAdapterConfig = {}) {}

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return exchangeApiKey(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Webhook ────────────────────────────────────────────────────────────────

  verifyWebhook(
    payload: Buffer,
    headers: Record<string, string>,
    secret: string,
  ): boolean {
    return verifyWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>) {
    return parseWebhookEvents(payload)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new ShipEngineClient(credentials)
    const page = params.page ?? 1
    const size = sizeFor(params)
    const res = await client.get<{ shipments: ShipEngineShipment[] } & ShipEnginePage>(
      '/shipments',
      {
        page_size: size,
        page,
        sort_dir: 'desc',
        modified_at_start: params.updatedAfter?.toISOString(),
      },
    )
    reportPage(params, res, page, size)
    return (res.shipments ?? []).map(transformShipment)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new ShipEngineClient(credentials)
    const raw = await client.get<ShipEngineShipment>(`/shipments/${id}`)
    return transformShipment(raw)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new ShipEngineClient(credentials)
    const raw = await client.post<ShipEngineShipment>('/shipments', {
      shipments: [
        {
          carrier_id: data.carrierId,
          service_code: data.serviceCode,
          external_shipment_id: data.reference,
          ship_from: data.originAddress
            ? {
                name: data.originAddress.name,
                company_name: data.originAddress.company,
                address_line1: data.originAddress.street1,
                address_line2: data.originAddress.street2,
                city_locality: data.originAddress.city,
                state_province: data.originAddress.state,
                postal_code: data.originAddress.postalCode,
                country_code: data.originAddress.country,
                phone: data.originAddress.phone,
                email: data.originAddress.email,
              }
            : undefined,
          ship_to: data.destinationAddress
            ? {
                name: data.destinationAddress.name,
                company_name: data.destinationAddress.company,
                address_line1: data.destinationAddress.street1,
                address_line2: data.destinationAddress.street2,
                city_locality: data.destinationAddress.city,
                state_province: data.destinationAddress.state,
                postal_code: data.destinationAddress.postalCode,
                country_code: data.destinationAddress.country,
                phone: data.destinationAddress.phone,
                email: data.destinationAddress.email,
              }
            : undefined,
          packages: data.totalWeight
            ? [
                {
                  weight: {
                    value: data.totalWeight.value,
                    unit: data.totalWeight.unit === 'oz'
                      ? 'ounce'
                      : data.totalWeight.unit === 'lb'
                        ? 'pound'
                        : data.totalWeight.unit === 'g'
                          ? 'gram'
                          : 'kilogram',
                  },
                },
              ]
            : undefined,
        },
      ],
    })
    // POST /shipments returns { shipments: [...] }
    const list = (raw as unknown as { shipments?: ShipEngineShipment[] }).shipments
    const first = list?.[0] ?? (raw as unknown as ShipEngineShipment)
    return transformShipment(first)
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new ShipEngineClient(credentials)
    await client.put<unknown>(`/shipments/${id}/cancel`, {})
  }

  // ── Carriers ───────────────────────────────────────────────────────────────

  async listCarriers(credentials: Credentials, params: QueryParams): Promise<Carrier[]> {
    const client = new ShipEngineClient(credentials)
    // GET /v1/carriers takes no paging params: it answers every carrier.
    const res = await client.get<{ carriers: ShipEngineCarrier[] }>('/carriers')
    return pageLocally((res.carriers ?? []).map(transformCarrier), params)
  }

  async getCarrier(credentials: Credentials, id: string): Promise<Carrier> {
    const client = new ShipEngineClient(credentials)
    const raw = await client.get<ShipEngineCarrier>(`/carriers/${id}`)
    return transformCarrier(raw)
  }

  // ── Warehouses ─────────────────────────────────────────────────────────────

  async listWarehouses(credentials: Credentials, params: QueryParams): Promise<Warehouse[]> {
    const client = new ShipEngineClient(credentials)
    // Envelope, not a bare array: `{ "warehouses": [...] }` (required key in
    // the ShipEngine OpenAPI spec), same shape as /carriers and /shipments.
    // It takes no paging params either: every warehouse comes back at once.
    const res = await client.get<{ warehouses: ShipEngineWarehouse[] }>('/warehouses')
    return pageLocally((res.warehouses ?? []).map(transformWarehouse), params)
  }

  async getWarehouse(credentials: Credentials, id: string): Promise<Warehouse> {
    const client = new ShipEngineClient(credentials)
    const raw = await client.get<ShipEngineWarehouse>(`/warehouses/${id}`)
    return transformWarehouse(raw)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(
    credentials: Credentials,
    trackingNumber: string,
  ): Promise<TrackingEvent[]> {
    const client = new ShipEngineClient(credentials)
    const raw = await client.get<ShipEngineTrackingInformation>('/tracking', {
      tracking_number: trackingNumber,
    })
    return transformTrackingInformation(raw)
  }

  async listTrackingEvents(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<TrackingEvent[]> {
    // ShipEngine doesn't have a list-all-tracking endpoint; use shipments as proxy.
    // Events are flattened out of pages of shipments, so one upstream page is
    // not one caller page: pageByRows cuts the caller's rows out of the walk.
    const client = new ShipEngineClient(credentials)
    const size = TRACKING_SHIPMENT_PAGE_SIZE
    const key = cursorPagerKey(connectionScope('shipengine', credentials), 'tracking-events', {
      page_size: size,
      sort_dir: 'desc',
    })
    const result = await pageByRows<TrackingEvent, number>(
      key,
      params,
      async (cursor) => {
        const page = cursor ?? 1
        const res = await client.get<{ shipments: ShipEngineShipment[] } & ShipEnginePage>(
          '/shipments',
          { page_size: size, page, sort_dir: 'desc' },
        )
        const events: TrackingEvent[] = []
        for (const shipment of res.shipments ?? []) {
          if (!shipment.tracking_number) continue
          try {
            const tracking = await client.get<ShipEngineTrackingInformation>('/tracking', {
              tracking_number: shipment.tracking_number,
              carrier_code: shipment.carrier_code,
            })
            events.push(...transformTrackingInformation(tracking))
          } catch {
            // Skip shipments without tracking data
          }
        }
        const next = typeof res.pages === 'number' && page < res.pages ? page + 1 : undefined
        return { items: events, next }
      },
      { maxUpstreamPages: TRACKING_MAX_UPSTREAM_PAGES },
    )
    return result.items
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new ShipEngineClient(credentials)
    const res = await client.post<{
      rate_response?: { rates?: ShipEngineRate[]; invalid_rates?: ShipEngineRate[] }
    }>('/rates', {
      rate_options: {
        carrier_ids: [],
        service_codes: params.serviceCodes,
      },
      shipment: {
        ship_from: {
          name: params.originAddress.name,
          company_name: params.originAddress.company,
          address_line1: params.originAddress.street1,
          address_line2: params.originAddress.street2,
          city_locality: params.originAddress.city,
          state_province: params.originAddress.state,
          postal_code: params.originAddress.postalCode,
          country_code: params.originAddress.country,
          phone: params.originAddress.phone,
        },
        ship_to: {
          name: params.destinationAddress.name,
          company_name: params.destinationAddress.company,
          address_line1: params.destinationAddress.street1,
          address_line2: params.destinationAddress.street2,
          city_locality: params.destinationAddress.city,
          state_province: params.destinationAddress.state,
          postal_code: params.destinationAddress.postalCode,
          country_code: params.destinationAddress.country,
          phone: params.destinationAddress.phone,
        },
        packages: params.packages.map((pkg) => ({
          weight: pkg.weight
            ? {
                value: pkg.weight.value,
                unit: pkg.weight.unit === 'oz'
                  ? 'ounce'
                  : pkg.weight.unit === 'lb'
                    ? 'pound'
                    : pkg.weight.unit === 'g'
                      ? 'gram'
                      : 'kilogram',
              }
            : undefined,
          dimensions: pkg.dimensions
            ? {
                unit: pkg.dimensions.unit === 'cm' ? 'centimeter' : 'inch',
                length: pkg.dimensions.length,
                width: pkg.dimensions.width,
                height: pkg.dimensions.height,
              }
            : undefined,
        })),
      },
    })
    const rates = res.rate_response?.rates ?? []
    return rates.map(transformRate)
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  async listLabels(credentials: Credentials, params: QueryParams): Promise<Label[]> {
    const client = new ShipEngineClient(credentials)
    const page = params.page ?? 1
    const size = sizeFor(params)
    const res = await client.get<{ labels: ShipEngineLabel[] } & ShipEnginePage>('/labels', {
      page_size: size,
      page,
      sort_dir: 'desc',
    })
    reportPage(params, res, page, size)
    return (res.labels ?? []).map(transformLabel)
  }

  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    const client = new ShipEngineClient(credentials)
    const raw = await client.get<ShipEngineLabel>(`/labels/${id}`)
    return transformLabel(raw)
  }

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    if (!data.shipmentId && !data.carrierId) {
      throw new Error('Either shipmentId or carrierId is required to purchase a label')
    }
    const client = new ShipEngineClient(credentials)

    if (data.shipmentId) {
      // Purchase label from an existing shipment
      const raw = await client.post<ShipEngineLabel>(
        `/labels/shipment/${data.shipmentId}`,
        {
          label_format: data.format?.toLowerCase() ?? 'pdf',
          label_layout: '4x6',
        },
      )
      return transformLabel(raw)
    }

    // Create label directly with carrier/service details
    const raw = await client.post<ShipEngineLabel>('/labels', {
      label_format: data.format?.toLowerCase() ?? 'pdf',
      label_layout: '4x6',
      shipment: {
        carrier_id: data.carrierId,
        service_code: data.serviceCode,
        tracking_number: data.trackingNumber,
      },
    })
    return transformLabel(raw)
  }

  async voidLabel(credentials: Credentials, id: string): Promise<void> {
    const client = new ShipEngineClient(credentials)
    await client.put<unknown>(`/labels/${id}/void`, {})
  }

  // ── Manifests ──────────────────────────────────────────────────────────────

  async listManifests(credentials: Credentials, params: QueryParams): Promise<Manifest[]> {
    const client = new ShipEngineClient(credentials)
    const page = params.page ?? 1
    const size = sizeFor(params)
    const res = await client.get<{ manifests: ShipEngineManifest[] } & ShipEnginePage>(
      '/manifests',
      { page_size: size, page },
    )
    reportPage(params, res, page, size)
    return (res.manifests ?? []).map(transformManifest)
  }

  async getManifest(credentials: Credentials, id: string): Promise<Manifest> {
    const client = new ShipEngineClient(credentials)
    const raw = await client.get<ShipEngineManifest>(`/manifests/${id}`)
    return transformManifest(raw)
  }

  async createManifest(credentials: Credentials, data: Partial<Manifest>): Promise<Manifest> {
    const client = new ShipEngineClient(credentials)
    const raw = await client.post<ShipEngineManifest>('/manifests', {
      carrier_id: data.carrierId,
      warehouse_id: data.warehouseId,
      ship_date: data.submittedAt?.toISOString().split('T')[0],
      excluded_label_ids: [],
    })
    return transformManifest(raw)
  }
}
