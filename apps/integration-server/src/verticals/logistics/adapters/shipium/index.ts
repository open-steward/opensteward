// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: carrier — Shipium has no REST endpoint to list/retrieve carriers;
//              the carrier catalog is static configuration documented in the
//              Supported Carriers page, not queryable via API.

import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
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
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Label } from '../../schema/label'
import type { Order } from '../../schema/order'
import type { Warehouse } from '../../schema/warehouse'
import type { Manifest } from '../../schema/manifest'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { ShipiumClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import {
  transformShipment,
  type ShipiumCarrierLabel,
  type ShipiumShipment,
} from './transform/shipment'
import {
  transformEvaluatedServiceMethod,
  type ShipiumEvaluatedServiceMethod,
} from './transform/rate'
import { transformLabelFromResponse } from './transform/label'
import { transformTrackingResponse, type ShipiumTrackingResponse } from './transform/tracking'
import { toShipiumAddress } from './transform/address'
import {
  transformOrder,
  type ShipiumOrder,
  type ShipiumOrderSearchResults,
} from './transform/order'
import {
  transformOrigin,
  type ShipiumOrigin,
  type ShipiumOriginsListResponse,
} from './transform/warehouse'
import { transformManifestFromRequest, type ShipiumManifestRequest } from './transform/manifest'

interface ShipiumAdapterConfig {
  /** No-op — Shipium uses API key auth only. Reserved for future config. */
  _unused?: never
}

const SIMPLE_API_KEY_FORM = simpleApiKey()

export class ShipiumAdapter implements LogisticsAdapter {
  // Connect Link support — single API-key form.
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'shipium'
  readonly version = '1'

  constructor(_config: ShipiumAdapterConfig = {}) {}

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // For Shipium the "code" is the "apiKeyId:apiKey" pair.
    return exchangeApiKey(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new ShipiumClient(credentials)
    // Shipium does not expose a generic "list all shipments" endpoint.
    // We support listing by partner shipment IDs when provided in params.cursor.
    const cursorStr = typeof params['cursor'] === 'string' ? params['cursor'] : undefined
    if (cursorStr) {
      const ids = cursorStr
        .split(',')
        .map((s: string) => s.trim())
        .filter(Boolean)
      const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
      const batch = ids.slice(0, limit)
      const res = await client.post<{ trackingResults?: ShipiumTrackingResponse[] }>(
        '/tracking/bulkPartnerShipmentIdSearch',
        { partnerShipmentIds: batch, excludeEvents: true },
      )
      return (res.trackingResults ?? []).map((t) => {
        const s: ShipiumShipment = {
          shipiumShipmentId: t.shipiumShipmentId ?? undefined,
          partnerShipmentId: t.partnerReferenceId ?? undefined,
          shipmentStatus: t.shipmentStatus ?? undefined,
          carrierLabel: {
            carrierTrackingId: t.carrierTrackingId ?? undefined,
            carrierTrackingLink: t.carrierTrackingLink ?? undefined,
          },
        }
        return transformShipment(s)
      })
    }
    return []
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new ShipiumClient(credentials)
    // id can be a shipiumShipmentId or carrierTrackingId.
    // Try the tracking endpoint by Shipium ID first; fall back to no-op stub.
    const raw = await client.get<ShipiumTrackingResponse>(`/tracking/${encodeURIComponent(id)}`, {
      excludeEvents: false,
    })
    const s: ShipiumShipment = {
      shipiumShipmentId: raw.shipiumShipmentId ?? id,
      partnerShipmentId: raw.partnerReferenceId ?? undefined,
      shipmentStatus: raw.shipmentStatus ?? undefined,
      carrierLabel: {
        carrierTrackingId: raw.carrierTrackingId ?? undefined,
        carrierTrackingLink: raw.carrierTrackingLink ?? undefined,
      },
    }
    return transformShipment(s)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new ShipiumClient(credentials)
    const raw = await client.post<ShipiumShipment>('/shipment/carrierselection/label', {
      currencyCode: 'usd',
      generateLabel: true,
      shipmentParameters: {
        destinationAddress: toShipiumAddress(data.destinationAddress),
        shipFromAddress: toShipiumAddress(data.originAddress),
        returnToAddress: toShipiumAddress(data.returnAddress),
        packagingType: data.totalWeight
          ? {
              weight: data.totalWeight.value,
              weightUnit: data.totalWeight.unit,
            }
          : undefined,
        totalWeight: data.totalWeight
          ? {
              value: data.totalWeight.value,
              unitOfMeasure: data.totalWeight.unit,
            }
          : undefined,
      },
      labelParameters: {
        includeLabelImagesInResponse: false,
        labelFormats: ['pdf'],
        eligibleForManifest: true,
      },
      partnerShipmentId: data.reference,
      includeEvaluatedServiceMethodsInResponse: false,
    })
    return transformShipment(raw)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(
    credentials: Credentials,
    trackingNumber: string,
  ): Promise<TrackingEvent[]> {
    const client = new ShipiumClient(credentials)
    // trackingNumber may be a Shipium tracking UUID or a carrier tracking number.
    // Try by Shipium ID first — the endpoint accepts UUIDs.
    const raw = await client.get<ShipiumTrackingResponse>(
      `/tracking/${encodeURIComponent(trackingNumber)}`,
      { excludeEvents: false },
    )
    return transformTrackingResponse(raw)
  }

  async listTrackingEvents(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<TrackingEvent[]> {
    const client = new ShipiumClient(credentials)
    const cursorStr2 = typeof params['cursor'] === 'string' ? params['cursor'] : undefined
    if (!cursorStr2) return []
    const ids = cursorStr2
      .split(',')
      .map((s: string) => s.trim())
      .filter(Boolean)
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const batch = ids.slice(0, limit)
    const res = await client.post<{ trackingResults?: ShipiumTrackingResponse[] }>(
      '/tracking/bulkTrackingSearch',
      { shipiumTrackingIds: batch, excludeEvents: false },
    )
    return (res.trackingResults ?? []).flatMap(transformTrackingResponse)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new ShipiumClient(credentials)
    const firstPkg = params.packages[0]
    const res = await client.post<{ evaluatedServiceMethods?: ShipiumEvaluatedServiceMethod[] }>(
      '/shipment/carrierselection/label',
      {
        currencyCode: 'usd',
        generateLabel: false,
        shipmentParameters: {
          destinationAddress: toShipiumAddress(params.destinationAddress),
          shipFromAddress: toShipiumAddress(params.originAddress),
          packagingType: firstPkg?.weight
            ? {
                weight: firstPkg.weight.value,
                weightUnit: firstPkg.weight.unit,
              }
            : undefined,
          totalWeight: firstPkg?.weight
            ? {
                value: firstPkg.weight.value,
                unitOfMeasure: firstPkg.weight.unit,
              }
            : undefined,
        },
        includeEvaluatedServiceMethodsInResponse: true,
      },
    )
    return (res.evaluatedServiceMethods ?? []).map(transformEvaluatedServiceMethod)
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  /**
   * getLabelShortcutV1: `GET /api/v1/deliveryexperience/shipment/carrierSelection/label/{shipiumLabelId}`
   * with the required `includeLabelImagesInResponse` query flag. The 200 body is
   * the `CarrierLabel` itself ("Label previously generated for the shipment.").
   */
  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    const client = new ShipiumClient(credentials)
    const raw = await client.get<ShipiumCarrierLabel>(
      `/deliveryexperience/shipment/carrierSelection/label/${encodeURIComponent(id)}`,
      { includeLabelImagesInResponse: false },
    )
    const shipmentId = typeof raw.shipiumShipmentId === 'string' ? raw.shipiumShipmentId : undefined
    const created =
      typeof raw.labelCreationDateTime === 'string' ? raw.labelCreationDateTime : undefined
    return transformLabelFromResponse(raw, shipmentId, created)
  }

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    if (!data.shipmentId) throw new Error('shipmentId is required to create a Shipium label')
    const client = new ShipiumClient(credentials)
    // Re-request label for an existing shipment by its carrier selection ID.
    const raw = await client.post<ShipiumShipment>('/shipment/carrierselection/label', {
      currencyCode: 'usd',
      generateLabel: true,
      carrierSelectionId: data.shipmentId,
      labelParameters: {
        includeLabelImagesInResponse: false,
        labelFormats: ['pdf'],
        eligibleForManifest: true,
      },
    })
    const label = raw.carrierLabel ?? {}
    return transformLabelFromResponse(
      label,
      raw.shipiumShipmentId ?? data.shipmentId,
      raw.createdAt ?? undefined,
    )
  }

  async voidLabel(credentials: Credentials, id: string): Promise<void> {
    const client = new ShipiumClient(credentials)
    await client.delete(
      `/deliveryexperience/shipment/carrierSelection/label/${encodeURIComponent(id)}`,
    )
  }

  // ── Orders ─────────────────────────────────────────────────────────────────

  /**
   * searchOrdersV1: `GET /api/v1/deliveryexperience/order/search`
   * (https://docs.shipium.com/reference/searchordersv1). Paged by `count` ("The
   * number results to include on each page of the response") and `anchor`
   * ("Identifier for the current page of data."); the 200 body is
   * `OrchestratedAssetBatchResults`, whose `results` are the orders.
   *
   * Next page: searchOrdersV1 declares NO response headers, so the next-page
   * signal here is not documented for this operation. The next anchor is read
   * from `X-Page-Next`, which the same OpenAPI declares on every sibling search
   * that takes this anchor/count pair (searchPackShipOrderOrchestrationV1
   * `GET /api/v1/packShip/order`, searchLabelsV1, searchLtlCostsV1): "Anchor to
   * the next page of results. If this is missing, there are no more pages. This
   * should be used in the `anchor` query parameter". The Pack App guide's
   * "Search an order" section says the same of the packShip order search
   * (https://docs.shipium.com/docs/pack-app-api), not of this endpoint. UNVERIFIED
   * LIVE: if Shipium omits the header here, page 1 reports hasMore=false. No
   * maximum `count` is documented, so the caller's limit is sent as is.
   */
  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new ShipiumClient(credentials)
    const count = params.limit
    const key = cursorPagerKey(connectionScope('shipium', credentials), 'orders', { count })
    const { items, hasMore } = await pageByCursor<Order>(key, params.page, async (anchor) => {
      const query: Record<string, unknown> = {}
      if (count !== undefined) query['count'] = count
      if (anchor !== undefined) query['anchor'] = anchor
      const res = await client.getWithHeaders<ShipiumOrderSearchResults>(
        '/deliveryexperience/order/search',
        query,
      )
      const next = res.headers['x-page-next']
      return {
        items: (res.data.results ?? []).map(transformOrder),
        next: typeof next === 'string' && next.length > 0 ? next : undefined,
      }
    })
    reportUpstreamPage(params, { hasMore })
    return items
  }

  /** getOrderV1: `GET /api/v1/deliveryexperience/order/{orderId}` ("Retrieve an order."). */
  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new ShipiumClient(credentials)
    const raw = await client.get<ShipiumOrder>(
      `/deliveryexperience/order/${encodeURIComponent(id)}`,
    )
    return transformOrder(raw)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new ShipiumClient(credentials)
    const raw = await client.post<ShipiumOrder>('/order', {
      partnerOrderId: data.orderNumber,
      orderedDateTime: data.orderAt?.toISOString(),
      destinationAddress: toShipiumAddress(data.destinationAddress),
      shipFromAddress: toShipiumAddress(data.originAddress),
      currencyCode: data.currency?.toLowerCase(),
      shipOption: data.requestedServiceCode,
    })
    return transformOrder(raw)
  }

  // ── Warehouses ─────────────────────────────────────────────────────────────

  async listWarehouses(credentials: Credentials, params: QueryParams): Promise<Warehouse[]> {
    const client = new ShipiumClient(credentials)
    // "Retrieve all origins": GET /partnerConfiguration/origins takes no paging
    // parameters and returns every origin in `results`, so the caller's page is
    // sliced locally (https://docs.shipium.com/docs/origin-configuration-api).
    const res = await client.get<ShipiumOriginsListResponse>('/partnerConfiguration/origins')
    return pageLocally((res.results ?? []).map(transformOrigin), params)
  }

  async getWarehouse(credentials: Credentials, id: string): Promise<Warehouse> {
    const client = new ShipiumClient(credentials)
    const raw = await client.get<ShipiumOrigin>(
      `/partnerConfiguration/origins/${encodeURIComponent(id)}`,
    )
    return transformOrigin(raw)
  }

  // ── Manifests ──────────────────────────────────────────────────────────────

  async createManifest(credentials: Credentials, data: Partial<Manifest>): Promise<Manifest> {
    const client = new ShipiumClient(credentials)
    const req: ShipiumManifestRequest = {
      carrierId: data.carrierId,
    }
    // Shipium's POST /manifest/carrier returns a success message, not a manifest object.
    await client.post<unknown>('/manifest/carrier', req)
    return transformManifestFromRequest(req, new Date())
  }
}
