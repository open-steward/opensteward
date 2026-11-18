/**
 * Infoplus WMS/OMS logistics adapter.
 *
 * Infoplus is a multi-tenant WMS and OMS platform. This adapter covers:
 *   - Customer orders (list, get, create, cancel)
 *   - Outbound shipments (list, get, create, cancel)
 *   - Warehouse facilities (list, get)
 *   - Carriers (list, get)
 * Tracking events and labels refuse with 501: the v2.0 API has no resource
 * for either.
 *
 * Auth: Static API key sent as the `API-Key` HTTP header. No OAuth2 flow.
 * The API key and customer domain are both captured at connect time via
 * the customForm credential template and stored in credentials.extra.domain.
 *
 * Base URL: https://<domain>/infoplus-wms/api/v2.0/
 *   where <domain> is the customer's Infoplus subdomain,
 *   e.g. "mycompany.infopluswms.com"
 *
 * No documented webhook signing scheme — webhook.ts is omitted.
 *
 * Ref: https://developer.infopluscommerce.com/api/reference/v2.0/
 */

import { customForm, reportUpstreamPage } from '@opensteward/shared'
import type { LogisticsAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { Order } from '../../schema/order'
import type { Carrier } from '../../schema/carrier'
import type { Warehouse } from '../../schema/warehouse'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Label } from '../../schema/label'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { InfoplusClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import {
  transformShipment,
  type InfoplusParcelShipment,
} from './transform/shipment'
import { transformOrder, type InfoplusOrder } from './transform/order'
import { transformWarehouse, type InfoplusWarehouse } from './transform/warehouse'
import { transformCarrier, type InfoplusCarrier } from './transform/carrier'

// ── Resource coverage ──────────────────────────────────────────────────────────
// Unavailable: manifest — no shipment manifest endpoint exists; ManifestPartner is a lookup reference (id + label) unrelated to the canonical Manifest schema
// Unavailable: rate    — no real-time rate shopping endpoint exists; RateCard is a static pricing config record, not a shipment rate quote

// ── Connect Link credential form ─────────────────────────────────────────────
// Infoplus requires an API key AND the customer's tenant domain.
const CREDENTIAL_FORM = customForm({
  fields: [
    {
      name: 'apiKey',
      label: 'API key',
      type: 'password',
      required: true,
      helpText:
        'Generate an API key in Infoplus under Admin → Users → API Keys.',
    },
    {
      name: 'domain',
      label: 'Account domain',
      type: 'text',
      required: true,
      placeholder: 'mycompany.infopluswms.com',
      helpText:
        'Your Infoplus account domain (the hostname you use to log in).',
    },
  ],
  exchange: async (fields: Record<string, string>): Promise<Credentials> => {
    const apiKey = (fields['apiKey'] ?? '').trim()
    const domain = (fields['domain'] ?? '').trim()
    if (!apiKey) throw new Error('API key is required.')
    if (!domain) throw new Error('Account domain is required.')
    return exchangeApiKey(apiKey, domain)
  },
})

// ── Listing ──────────────────────────────────────────────────────────────────

/**
 * One caller page of `GET /v2.0/<resource>/search`.
 *
 * Swagger (https://developer.infopluscommerce.com/api/reference/v2.0/swagger.json),
 * on each of order, parcelShipment, carrier and warehouse search:
 *   page:  "Result page number.  Defaults to 1."
 *   limit: "Maximum results per page.  Defaults to 20.  Max allowed value is 250."
 * and the 200 response is `{"type":"array","items":{"$ref":…}}`: a bare
 * array with no count and no next link. A page shorter than the size asked
 * for is therefore the only end signal, and the only one reported. The
 * `filter` and `sort` parameters are documented only as "Query string,
 * used to filter results." and "Sort results by specified field.", with no
 * syntax, so neither is sent.
 */
async function searchPage<T>(
  credentials: Credentials,
  resource: 'order' | 'parcelShipment' | 'carrier' | 'warehouse',
  params: QueryParams,
): Promise<T[]> {
  const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
  const rows = await new InfoplusClient(credentials).get<unknown>(`${resource}/search`, {
    page: params.page ?? 1,
    limit,
  })
  if (!Array.isArray(rows)) {
    throw new Error(`Infoplus ${resource}/search returned ${typeof rows}, not the documented array`)
  }
  reportUpstreamPage(params, {
    ...(params.limit !== undefined && limit < params.limit ? { pageSize: limit } : {}),
    ...(rows.length < limit ? { hasMore: false } : {}),
  })
  return rows as T[]
}

/** Refuse before sending anything: the sync worker skips a resource on this. */
function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

const NO_TRACKING_HISTORY =
  'Infoplus cannot list tracking events: the v2.0 API reference defines no tracking or ' +
  'parcel-activity resource (parcelShipmentActivity is not in its swagger); a parcelShipment ' +
  'carries only its current trackingNo, shipped and deliveredDate'

const NO_LABELS =
  'Infoplus cannot list labels: the v2.0 API reference defines no label resource, and its ' +
  'parcelShipment definition has no label URL or label document field'

// ── Adapter ──────���───────────────────────────���────────────────────────────────

interface InfoplusAdapterConfig {
  /** Reserved for future use (e.g. a fixed defaultLobId). */
  [key: string]: unknown
}

export class InfoplusAdapter implements LogisticsAdapter {
  readonly platform = 'infoplus'
  readonly version = '1'

  credentialFields = CREDENTIAL_FORM.credentialFields
  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  // Every search endpoint: "Max allowed value is 250."
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  constructor(_config: InfoplusAdapterConfig = {}) {}

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // code format: "apiKey:domain"
    const sep = code.indexOf(':')
    const apiKey = sep > -1 ? code.slice(0, sep) : code
    const domain = sep > -1 ? code.slice(sep + 1) : ''
    return exchangeApiKey(apiKey, domain)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Orders ───────────────────────────────────��─────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const rows = await searchPage<InfoplusOrder>(credentials, 'order', params)
    return rows.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new InfoplusClient(credentials)
    const raw = await client.get<InfoplusOrder>(`order/${encodeURIComponent(id)}`)
    return transformOrder(raw)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new InfoplusClient(credentials)
    const raw = await client.post<InfoplusOrder>('order', {
      orderNo: data.orderNumber,
      customerId: data.customerId,
      warehouseId: data.warehouseId,
      notes: data.notes,
      serviceTypeId: data.requestedServiceCode,
      freight: data.shippingAmount != null ? data.shippingAmount / 100 : undefined,
      shipToAttention: data.destinationAddress?.name,
      shipToCompany: data.destinationAddress?.company,
      shipToStreet: data.destinationAddress?.street1,
      shipToStreet2: data.destinationAddress?.street2,
      shipToCity: data.destinationAddress?.city,
      shipToState: data.destinationAddress?.state,
      shipToZip: data.destinationAddress?.postalCode,
      shipToCountry: data.destinationAddress?.country,
      shipToPhone: data.destinationAddress?.phone,
      shipToEmail: data.destinationAddress?.email,
      shipFromAttention: data.originAddress?.name,
      shipFromCompany: data.originAddress?.company,
      shipFromStreet: data.originAddress?.street1,
      shipFromStreet2: data.originAddress?.street2,
      shipFromCity: data.originAddress?.city,
      shipFromState: data.originAddress?.state,
      shipFromZip: data.originAddress?.postalCode,
      shipFromCountry: data.originAddress?.country,
      lineItems: data.lineItems?.map((li) => ({
        sku: li.sku,
        itemDescription: li.description,
        orderedQty: li.quantity,
        unitCost: li.unitAmount != null ? li.unitAmount / 100 : undefined,
      })),
    })
    return transformOrder(raw)
  }

  async cancelOrder(credentials: Credentials, id: string): Promise<void> {
    const client = new InfoplusClient(credentials)
    await client.post<unknown>(`order/${encodeURIComponent(id)}/cancel`, {})
  }

  // ── Shipments ───────��──────────────────────────────────────────────────────

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const rows = await searchPage<InfoplusParcelShipment>(credentials, 'parcelShipment', params)
    return rows.map(transformShipment)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new InfoplusClient(credentials)
    const raw = await client.get<InfoplusParcelShipment>(
      `parcelShipment/${encodeURIComponent(id)}`,
    )
    return transformShipment(raw)
  }

  async createShipment(
    credentials: Credentials,
    data: Partial<Shipment>,
  ): Promise<Shipment> {
    const client = new InfoplusClient(credentials)
    const raw = await client.post<InfoplusParcelShipment>('parcelShipment', {
      warehouseId: data.warehouseId,
      serviceCode: data.serviceCode,
      weightLbs: data.totalWeight?.unit === 'lb'
        ? data.totalWeight?.value
        : undefined,
      externalShippingSystemId: data.reference,
      shipToAttention: data.destinationAddress?.name,
      shipToCompany: data.destinationAddress?.company,
      shipToStreet: data.destinationAddress?.street1,
      shipToStreet2: data.destinationAddress?.street2,
      shipToCity: data.destinationAddress?.city,
      shipToState: data.destinationAddress?.state,
      shipToZip: data.destinationAddress?.postalCode,
      shipToCountry: data.destinationAddress?.country,
      shipToPhone: data.destinationAddress?.phone,
      shipFromAttention: data.originAddress?.name,
      shipFromCompany: data.originAddress?.company,
      shipFromStreet: data.originAddress?.street1,
      shipFromStreet2: data.originAddress?.street2,
      shipFromCity: data.originAddress?.city,
      shipFromState: data.originAddress?.state,
      shipFromZip: data.originAddress?.postalCode,
      shipFromCountry: data.originAddress?.country,
    })
    return transformShipment(raw)
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new InfoplusClient(credentials)
    await client.post<unknown>(
      `parcelShipment/${encodeURIComponent(id)}/cancel`,
      {},
    )
  }

  // ── Tracking Events ─────────────���───────────────────────────���──────────────

  async listTrackingEvents(
    _credentials: Credentials,
    _params: QueryParams,
  ): Promise<TrackingEvent[]> {
    throw notSupported(NO_TRACKING_HISTORY)
  }

  async getTrackingEvents(
    _credentials: Credentials,
    _trackingNumber: string,
  ): Promise<TrackingEvent[]> {
    throw notSupported(NO_TRACKING_HISTORY)
  }

  // ── Warehouses ───────��───────────────────────────────���─────────────────────

  async listWarehouses(credentials: Credentials, params: QueryParams): Promise<Warehouse[]> {
    const rows = await searchPage<InfoplusWarehouse>(credentials, 'warehouse', params)
    return rows.map(transformWarehouse)
  }

  async getWarehouse(credentials: Credentials, id: string): Promise<Warehouse> {
    const client = new InfoplusClient(credentials)
    const raw = await client.get<InfoplusWarehouse>(
      `warehouse/${encodeURIComponent(id)}`,
    )
    return transformWarehouse(raw)
  }

  // ── Carriers ──────────────���──────────────────────��─────────────────────────

  async listCarriers(credentials: Credentials, params: QueryParams): Promise<Carrier[]> {
    const rows = await searchPage<InfoplusCarrier>(credentials, 'carrier', params)
    return rows.map(transformCarrier)
  }

  async getCarrier(credentials: Credentials, id: string): Promise<Carrier> {
    const client = new InfoplusClient(credentials)
    const raw = await client.get<InfoplusCarrier>(
      `carrier/${encodeURIComponent(id)}`,
    )
    return transformCarrier(raw)
  }

  // ── Labels ──────────────────────────────────────────────────────────────────

  async listLabels(_credentials: Credentials, _params: QueryParams): Promise<Label[]> {
    throw notSupported(NO_LABELS)
  }

  async getLabel(_credentials: Credentials, _id: string): Promise<Label> {
    throw notSupported(NO_LABELS.replace('cannot list labels', 'cannot read a label'))
  }
}
