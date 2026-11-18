import { simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
  RateRequestParams,
} from '../../adapter/interface'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Order } from '../../schema/order'
import type { Shipment } from '../../schema/shipment'
import type { Carrier } from '../../schema/carrier'
import type { Warehouse } from '../../schema/warehouse'
import type { Rate } from '../../schema/rate'
import type { Label } from '../../schema/label'
import type { Manifest } from '../../schema/manifest'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { DropoffClient } from './client'
import {
  transformTracking,
  transformTrackingList,
  type DropoffOrder,
  type DropoffOrderListResponse,
} from './transform/tracking'
import { transformOrder, transformOrderList } from './transform/order'
import { transformShipment, transformShipmentList } from './transform/shipment'
import {
  transformWarehouse,
  transformWarehouseList,
  type DropoffFacility,
  type DropoffFacilityListResponse,
} from './transform/warehouse'
import { transformRateList, type DropoffRateQuoteResponse } from './transform/rate'

// ── Resource coverage ──────────────────────────────────────────────
// Dropoff runs its client portal on CXT Software's X Dispatch web service
// (https://dropoff.cxtsoftware.net/CxtWebService/CXTWCF.svc, OpenAPI at
// .../swagger/v1/swagger.json). That spec has no client-facing collection for
// carriers, labels or manifests, so those methods refuse with 501 before
// sending anything (quotes below).
//
// Orders, shipments, tracking events, warehouses, getRates and createOrder are
// NOT yet rebuilt: they still call the fabricated staging.dropoff.com/apiv2
// host. The spec documents real endpoints for them (GET /v2/Orders/History,
// POST /v2/Parcels/Track/Summaries + GET /v2/Parcels/Track/Details/{parcelId},
// GET /v2/Depots + POST /v3/Depots/Search), but types every 200 response only
// as "OK", with no schema, so the response fields cannot be mapped from the docs.

function notSupported(message: string): never {
  throw Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

const NO_CARRIERS =
  'Dropoff cannot list carriers: the X Dispatch API has no carrier collection for a client user; the nearest endpoint, POST /v2/Agents/Search ("Search agents."), searches the operator\'s agent records (columns ID, LAST_NAME, FIRST_NAME)'
const NO_MANIFESTS =
  'Dropoff cannot list manifests: POST /v2/Manifests/Search is documented as "Search consolidation manifests." (operator-side flight manifests searched by CARRIER, FLIGHT_NUMBER, ORIGIN_AIRPORT_CODE), not a shipper\'s manifests'
const NO_LABELS =
  'Dropoff cannot list labels: POST /v2/Labels/Search searches descriptive labels (columns ID, DESCRIPTION, CREATED_BY, CREATED_WHEN, UPDATED_BY, UPDATED_WHEN, IS_ACTIVE), not shipping labels; shipping labels exist only per order as PDFs (GET /v2/Orders/{orderId}/Parcels/PDF)'

const SIMPLE_API_KEY_FORM = simpleApiKey({
  label: 'API Key',
  helpText: 'Find your API key in the Dropoff portal under Settings > API.',
})

export class DropoffAdapter implements LogisticsAdapter {
  readonly platform = 'dropoff'
  readonly version = '1'

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  getAuthUrl(_state: string): string {
    return buildAuthUrl(_state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return exchangeApiKey(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async listTrackingEvents(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<TrackingEvent[]> {
    const client = new DropoffClient(credentials)
    const query: Record<string, unknown> = {}
    if (params.page !== undefined) query.page = params.page
    if (params.limit !== undefined) query.limit = params.limit
    if (params.updatedAfter) query.updated_after = params.updatedAfter.toISOString()
    const res = await client.get<DropoffOrderListResponse>('/order', query)
    const orders: DropoffOrder[] = res.data ?? []
    return transformTrackingList(orders)
  }

  async getTrackingEvents(
    credentials: Credentials,
    trackingNumber: string,
  ): Promise<TrackingEvent[]> {
    const client = new DropoffClient(credentials)
    const raw = await client.get<DropoffOrder>(`/order/${trackingNumber}`)
    return transformTracking(raw)
  }

  // ── Orders ─────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new DropoffClient(credentials)
    const query: Record<string, unknown> = {}
    if (params.page !== undefined) query.page = params.page
    if (params.limit !== undefined) query.limit = params.limit
    if (params.updatedAfter) query.updated_after = params.updatedAfter.toISOString()
    const res = await client.get<DropoffOrderListResponse>('/order', query)
    return transformOrderList(res.data ?? [])
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new DropoffClient(credentials)
    const raw = await client.get<DropoffOrder>(`/order/${id}`)
    return transformOrder(raw)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new DropoffClient(credentials)
    const raw = await client.post<DropoffOrder>('/order', data)
    return transformOrder(raw)
  }

  // ── Shipments (derived from Orders) ────────────────────────────────────────

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new DropoffClient(credentials)
    const query: Record<string, unknown> = {}
    if (params.page !== undefined) query.page = params.page
    if (params.limit !== undefined) query.limit = params.limit
    if (params.updatedAfter) query.updated_after = params.updatedAfter.toISOString()
    const res = await client.get<DropoffOrderListResponse>('/order', query)
    return transformShipmentList(res.data ?? [])
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new DropoffClient(credentials)
    const raw = await client.get<DropoffOrder>(`/order/${id}`)
    return transformShipment(raw)
  }

  // ── Carriers ───────────────────────────────────────────────────────────────

  async listCarriers(_credentials: Credentials, _params: QueryParams): Promise<Carrier[]> {
    return notSupported(NO_CARRIERS)
  }

  async getCarrier(_credentials: Credentials, _id: string): Promise<Carrier> {
    return notSupported(NO_CARRIERS)
  }

  // ── Warehouses (Facilities) ────────────────────────────────────────────────

  async listWarehouses(credentials: Credentials, _params: QueryParams): Promise<Warehouse[]> {
    const client = new DropoffClient(credentials)
    const res = await client.get<DropoffFacilityListResponse>('/facility')
    return transformWarehouseList(res.data ?? [])
  }

  async getWarehouse(credentials: Credentials, id: string): Promise<Warehouse> {
    const client = new DropoffClient(credentials)
    const raw = await client.get<DropoffFacility>(`/facility/${id}`)
    return transformWarehouse(raw)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new DropoffClient(credentials)
    const res = await client.post<DropoffRateQuoteResponse>('/order/rate_quote', {
      origin: params.originAddress,
      destination: params.destinationAddress,
      packages: params.packages,
    })
    return transformRateList(res.data ?? [])
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  async listLabels(_credentials: Credentials, _params: QueryParams): Promise<Label[]> {
    return notSupported(NO_LABELS)
  }

  async getLabel(_credentials: Credentials, _id: string): Promise<Label> {
    return notSupported(NO_LABELS)
  }

  // ── Manifests ──────────────────────────────────────────────────────────────

  async listManifests(_credentials: Credentials, _params: QueryParams): Promise<Manifest[]> {
    return notSupported(NO_MANIFESTS)
  }

  async getManifest(_credentials: Credentials, _id: string): Promise<Manifest> {
    return notSupported(NO_MANIFESTS)
  }

  verifyWebhook(_payload: Buffer, _headers: Record<string, string>, _secret: string): boolean {
    return false
  }
}
