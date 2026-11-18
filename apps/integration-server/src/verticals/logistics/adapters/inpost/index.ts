// ── Resource coverage ──────────────────────────────────────────────
// API: InPost ShipX (https://api-shipx-pl.easypack24.net/v1), static Bearer
// token plus the organization id (credentials.extra.organizationId).
// Docs: https://dokumentacja-inpost.atlassian.net/wiki/spaces/PL/pages/18153476/
// Available:   carrier (GET /v1/services → the single InPost carrier record)
//              manifest (GET /v1/organizations/:organization_id/dispatch_orders)
//              trackingevent (GET /v1/tracking/:tracking_number)
//              label, shipment (write methods, not yet rebuilt onto ShipX)
// Refused:     warehouse — the current ShipX docs document no dispatch-point
//              list or lookup (the only such page is archived).
// Unavailable: order — InPost has no order management endpoint; the platform
//              is a carrier-only service with no concept of merchant orders.
//              rate — InPost does not expose a rate-quoting API; pricing is
//              contractual and managed outside the API (per official docs).

import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Label } from '../../schema/label'
import type { Manifest } from '../../schema/manifest'
import type { Carrier } from '../../schema/carrier'
import type { Warehouse } from '../../schema/warehouse'
import { pageLocally, reportUpstreamPage, type CredentialField } from '@opensteward/shared'

import {
  credentialFields as inpostCredentialFields,
  exchangeCredentials as inpostExchangeCredentials,
  organizationId,
} from './auth'
import { InPostClient } from './client'

import { transformTrackingEvents, type InPostTrackingResponse } from './transform/tracking'
import { transformShipment, type InPostShipmentResponse } from './transform/shipment'
import { transformLabel, type InPostLabelResponse } from './transform/label'
import { transformManifest, type InPostDispatchOrderResponse } from './transform/manifest'
import { transformCarrier, INPOST_CARRIER_ID, type InPostServiceItem } from './transform/carrier'

/**
 * A ShipX collection: "count" ("A total number of items in the collection."),
 * "page", "per_page" ("A number of results (per page) returned to the
 * response."), "items"
 * (https://dokumentacja-inpost.atlassian.net/wiki/spaces/PL/pages/18153477/).
 */
interface ShipXCollection<T> {
  href?: string
  count: number
  page: number
  per_page: number
  items: T[]
}

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

const NO_DISPATCH_POINTS =
  'no current ShipX docs page documents a dispatch-point list or lookup; the only page that ' +
  'did ("[1.2.5] Dispatch points", GET /v1/organizations/:organization_id/dispatch_points) ' +
  'is archived'

export class InPostAdapter implements LogisticsAdapter {
  readonly platform = 'inpost'
  readonly version = '1'

  // ── Auth ───────────────────────────────────────────────────────────────────
  // ShipX uses a static token generated in Parcel Manager: there is no OAuth
  // redirect, token endpoint or refresh (see auth.ts).

  credentialFields(): CredentialField[] {
    return inpostCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return inpostExchangeCredentials(fields)
  }

  getAuthUrl(_state: string): string {
    throw new Error('InPost ShipX uses a static API token; use credentialFields() instead.')
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('InPost ShipX uses a static API token; use exchangeCredentials() instead.')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Carriers ───────────────────────────────────────────────────────────────
  // InPost is a single carrier. GET /v1/services ("Returns list of all
  // services handled by ShipX.") fills its `services`; the collection is that
  // one row, paged locally.

  private async fetchCarrier(credentials: Credentials): Promise<Carrier> {
    const client = new InPostClient(credentials)
    // The documented response is a bare array of services; anything else
    // carries no service to list.
    const services = await client.get<InPostServiceItem[] | undefined>('/services')
    return transformCarrier(Array.isArray(services) ? services : [])
  }

  async listCarriers(credentials: Credentials, params: QueryParams): Promise<Carrier[]> {
    return pageLocally([await this.fetchCarrier(credentials)], params)
  }

  async getCarrier(credentials: Credentials, id: string): Promise<Carrier> {
    if (id !== INPOST_CARRIER_ID) {
      throw Object.assign(new Error(`InPost carrier '${id}' not found`), {
        statusCode: 404,
        code: 'NOT_FOUND',
      })
    }
    return this.fetchCarrier(credentials)
  }

  // ── Warehouses (dispatch points) ───────────────────────────────────────────

  async listWarehouses(_credentials: Credentials, _params: QueryParams): Promise<Warehouse[]> {
    throw notSupported(`InPost cannot list warehouses (dispatch points): ${NO_DISPATCH_POINTS}`)
  }

  async getWarehouse(_credentials: Credentials, _id: string): Promise<Warehouse> {
    throw notSupported(`InPost cannot read a warehouse (dispatch point): ${NO_DISPATCH_POINTS}`)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────
  // GET /v1/tracking/:tracking_number ("Shipment History").

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new InPostClient(credentials)
    const res = await client.get<InPostTrackingResponse>(
      `/tracking/${encodeURIComponent(trackingNumber)}`,
    )
    return transformTrackingEvents(res)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new InPostClient(credentials)

    const body = {
      serviceCode: data.serviceCode,
      sender: {
        name: data.originAddress?.name,
        company: data.originAddress?.company,
        street: data.originAddress?.street1,
        city: data.originAddress?.city,
        postCode: data.originAddress?.postalCode,
        countryCode: data.originAddress?.country,
        phone: data.originAddress?.phone,
        email: data.originAddress?.email,
      },
      receiver: {
        name: data.destinationAddress?.name,
        company: data.destinationAddress?.company,
        street: data.destinationAddress?.street1,
        city: data.destinationAddress?.city,
        postCode: data.destinationAddress?.postalCode,
        countryCode: data.destinationAddress?.country,
        phone: data.destinationAddress?.phone,
        email: data.destinationAddress?.email,
      },
      weight: data.totalWeight
        ? { value: data.totalWeight.value, unit: data.totalWeight.unit }
        : undefined,
    }

    const res = await client.post<InPostShipmentResponse>('/shipments', body)
    return transformShipment(res)
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new InPostClient(credentials)
    await client.delete(`/shipments/${id}`)
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    const client = new InPostClient(credentials)
    const shipmentId = data.shipmentId ?? data.id
    if (!shipmentId) {
      throw new Error('inpost: shipmentId is required for label creation')
    }

    const res = await client.post<InPostLabelResponse>(`/shipments/${shipmentId}/labels`, {
      format: data.format ?? 'PDF',
    })
    return transformLabel(res)
  }

  // ── Manifests (dispatch orders) ───────────────────────────────────────────
  // "DispatchOrders list for specific organization can be accessed by using
  // this endpoint: GET /v1/organizations/:organization_id/dispatch_orders"
  // (https://dokumentacja-inpost.atlassian.net/wiki/spaces/PL/pages/18153482/).
  // Paging: "Scrolling through the pages of the collection is done by passing
  // query parameters (page) and/or (page_page)" — the collection echoes
  // `per_page` — and no maximum is documented (page 18153477). The query
  // name `per_page` is used verbatim by other current ShipX pages: the
  // Shipment page's example href "page=1&per_page=100&sort_by=id&sort_order=desc"
  // (page 18153485) and the Points page's "per_page Defines the amount of
  // points returned per page" (page 18153493). The default
  // order is created_at descending, which shifts pages as orders arrive, so
  // the request pins the documented `sort_by=id` / `sort_order=asc`
  // (page 18153497).

  async listManifests(credentials: Credentials, params: QueryParams): Promise<Manifest[]> {
    const orgId = organizationId(credentials, 'manifests (dispatch orders)')
    const page = typeof params.page === 'number' && params.page >= 1 ? Math.floor(params.page) : 1
    const limit =
      typeof params.limit === 'number' && Number.isFinite(params.limit) && params.limit >= 1
        ? Math.floor(params.limit)
        : undefined
    const query: Record<string, unknown> = { page, sort_by: 'id', sort_order: 'asc' }
    if (limit !== undefined) query['per_page'] = limit

    const client = new InPostClient(credentials)
    const res = await client.get<ShipXCollection<InPostDispatchOrderResponse>>(
      `/organizations/${encodeURIComponent(orgId)}/dispatch_orders`,
      query,
    )
    reportUpstreamPage(params, {
      totalCount: res.count,
      currentPage: res.page,
      hasMore: res.page * res.per_page < res.count,
      ...(limit !== undefined && res.per_page < limit ? { pageSize: res.per_page } : {}),
    })
    return res.items.map(transformManifest)
  }

  // "GET /v1/dispatch_orders/:id" (DispatchOrder details, page 18153482).
  async getManifest(credentials: Credentials, id: string): Promise<Manifest> {
    const client = new InPostClient(credentials)
    const res = await client.get<InPostDispatchOrderResponse>(
      `/dispatch_orders/${encodeURIComponent(id)}`,
    )
    return transformManifest(res)
  }

  async createManifest(credentials: Credentials, data: Partial<Manifest>): Promise<Manifest> {
    const client = new InPostClient(credentials)
    const body: Record<string, unknown> = {}
    if (data.shipmentIds && data.shipmentIds.length > 0) {
      body['shipments'] = data.shipmentIds.map((id) => ({ id }))
    }
    const res = await client.post<InPostDispatchOrderResponse>('/dispatch_orders', body)
    return transformManifest(res)
  }
}
