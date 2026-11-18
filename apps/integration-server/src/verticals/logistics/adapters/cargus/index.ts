import {
  connectionScope,
  pageByRows,
  pageLocally,
  reportUpstreamPage,
  simpleApiKey,
  DEFAULT_PAGE_LIMIT,
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

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { CargusClient } from './client'

import { transformShipment, type CargusAwb } from './transform/shipment'
import {
  transformAwbTrace,
  transformDeltaEvents,
  type CargusDeltaAwb,
  type CargusTracePackage,
} from './transform/tracking'
import { transformRate, type CargusRate } from './transform/rate'
import { transformOrder, type CargusOrder } from './transform/order'
import { transformWarehouse, type CargusPickupLocation } from './transform/warehouse'

interface CargusAdapterConfig {
  clientId?: string
  clientSecret?: string
  redirectUri?: string
  scopes?: string[]
}

const SIMPLE_API_KEY_FORM = simpleApiKey()

/**
 * Operations are cited by their id on the first-party developer portal for the
 * UrgentOnlineAPI:
 * https://urgentcargus.developer.azure-api.net/api-details#api=55acb9ae5f80b911a8f59a5f&operation=<OperationId>
 * (data: https://urgentcargus.developer.azure-api.net/developer/apis/55acb9ae5f80b911a8f59a5f/operations/<OperationId>?api-version=2022-04-01-preview).
 */
function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

const DAY_MS = 86_400_000

/**
 * UTC-day windows from `updatedAfter` up to the end of the current UTC day.
 * `top` is the next UTC midnight and `count` the number of windows; both
 * are fixed within a day, so page N of a walk is the same rows while those
 * windows hold the same rows.
 */
interface DayWindows {
  lower: number
  top: number
  count: number
}

function dayWindows(updatedAfter: Date): DayWindows | undefined {
  const lower = updatedAfter.getTime()
  const top = Math.floor(Date.now() / DAY_MS) * DAY_MS + DAY_MS
  if (!(lower < top)) return undefined
  const base = Math.floor(lower / DAY_MS) * DAY_MS
  return { lower, top, count: (top - base) / DAY_MS }
}

/**
 * The FromDate/ToDate of window `index`, NEWEST first: window 0 is the
 * current UTC day, and the oldest starts at `updatedAfter` itself.
 */
function windowAt(w: DayWindows, index: number): { FromDate: string; ToDate: string } {
  const end = w.top - index * DAY_MS
  const start = Math.max(end - DAY_MS, w.lower)
  return { FromDate: new Date(start).toISOString(), ToDate: new Date(end).toISOString() }
}

/** The caller's 1-based page, read the way `pageByRows` reads it. */
function callerPage(params: QueryParams): number {
  const page = params.page
  return typeof page === 'number' && Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1
}

/** A position in a windowed walk: window `w` (newest first), upstream page `p` (1-based). */
interface WindowPage {
  w: number
  p: number
}

/**
 * Rows of an operation that takes a FromDate/ToDate window and pages inside
 * it with `pageNumber` / `itemsPerPage` (`Awbs_GetByDate`,
 * `Orders_GetByDate`), walked over UTC-day windows newest first through
 * `pageByRows`. The response is a bare array with no total or next field, so
 * a page shorter than `itemsPerPage` ends its window. `itemsPerPage` is the
 * caller's limit: the portal documents no maximum.
 */
async function walkPagedWindows<Raw, R>(
  client: CargusClient,
  credentials: Credentials,
  path: string,
  updatedAfter: Date,
  params: QueryParams,
  transform: (raw: Raw) => R,
): Promise<R[]> {
  const w = dayWindows(updatedAfter)
  if (!w) {
    reportUpstreamPage(params, { hasMore: false })
    return []
  }
  const size = Math.floor(Number(params.limit ?? DEFAULT_PAGE_LIMIT))
  const key = `cargus:${connectionScope('cargus', credentials)}:${path}:${w.lower}:${w.top}:${size}`
  const { items } = await pageByRows<R, WindowPage>(
    key,
    params,
    async (cursor) => {
      const at = cursor ?? { w: 0, p: 1 }
      const res = await client.get<Raw[]>(path, {
        ...windowAt(w, at.w),
        pageNumber: at.p,
        itemsPerPage: size,
      })
      // 204 No Content (documented) arrives as an empty body.
      const rows = Array.isArray(res) ? res : []
      const next: WindowPage | null =
        rows.length === size
          ? { w: at.w, p: at.p + 1 }
          : at.w + 1 < w.count
            ? { w: at.w + 1, p: 1 }
            : null
      return { items: rows.map(transform), next }
    },
    // A call with no marks (a restart, an expired memo, a jump to page N)
    // walks from window 0, page 1. Each upstream page is either full (`size`
    // = limit rows, so at most `page` of them fill rows up to the end of the
    // caller's page) or the last page of its window (at most one per
    // window), plus one peek past the caller's page.
    { maxUpstreamPages: callerPage(params) + w.count + 2 },
  )
  return items
}

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: carrier  — Cargus is the carrier; no carrier-listing API exists
// Unavailable: manifest — no manifest/consolidation concept in the Cargus API

/**
 * Cargus (UrgentCargus) logistics adapter.
 *
 * Authentication:
 *  - Every request requires `Ocp-Apim-Subscription-Key: <apiKey>` (Azure API
 *    Management subscription key).
 *  - Mutating operations optionally also use a short-lived Bearer token obtained
 *    via POST /LoginUser.  The client handles token management internally.
 *
 * Platform slug: `cargus`
 *
 * Key capabilities implemented:
 *  - listShipments / getShipment / createShipment / cancelShipment
 *  - getTrackingEvents / listTrackingEvents
 *  - getRates
 *  - createLabel / voidLabel (listLabels and getLabel refuse: no documented label record)
 *  - listOrders / getOrder  (courier pickup requests — GET /Orders/GetByDate)
 *  - listWarehouses / getWarehouse  (pickup locations — GET /PickupLocations)
 */
export class CargusAdapter implements LogisticsAdapter {
  readonly platform = 'cargus'
  readonly version = '1'

  // Connect Link support — single API-key form.
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  constructor(_config: CargusAdapterConfig = {}) {}

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // For Cargus the "code" is the API subscription key itself.
    return exchangeApiKey(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  /**
   * AWBs from `Awbs_GetByDate`, "Get AWB by date with pagination":
   * `GET /api/Awbs/GetByDate?FromDate={FromDate}&ToDate={ToDate}`, both
   * "required": true, with query parameters `pageNumber` ("Page Number") and
   * `itemsPerPage` ("Items per Page") (portal: Awbs_GetByDate).
   * It is the only AWB list the portal documents; `GET /api/Awbs`, which this
   * used to call, is "Get AWB by orderId or barCode". The portal documents no
   * lookback limit, so a call without `updatedAfter` is refused before any
   * request, and a call with one walks UTC-day windows since then.
   */
  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    if (!params.updatedAfter) {
      throw notSupported(
        'Cargus cannot list shipments without updated_after: its only AWB list, ' +
          'GET /api/Awbs/GetByDate?FromDate={FromDate}&ToDate={ToDate} ("Get AWB by date with ' +
          'pagination"), requires a FromDate/ToDate window and documents no lookback limit. ' +
          'Pass updated_after to walk the windows since then.',
      )
    }
    const client = new CargusClient(credentials)
    return walkPagedWindows<CargusAwb, Shipment>(
      client,
      credentials,
      'Awbs/GetByDate',
      params.updatedAfter,
      params,
      transformShipment,
    )
  }

  /**
   * One AWB by barcode from `Awbs_Get`, "Get AWB by orderId or barCode":
   * `GET /api/Awbs` with query parameter `barCode`. The documented response
   * is an array of AWBs.
   */
  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new CargusClient(credentials)
    const res = await client.get<CargusAwb[]>('Awbs', { barCode: id })
    const raw = (Array.isArray(res) ? res : []).find((a) => a.BarCode === id)
    if (!raw) {
      throw Object.assign(new Error(`Cargus AWB not found: ${id}`), { statusCode: 404 })
    }
    return transformShipment(raw)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new CargusClient(credentials)

    const body: Record<string, unknown> = {
      Parcels: 1,
      TotalWeight: data.totalWeight?.value ?? 1,
      PackageContent: data.notes ?? '',
      CustomString: data.reference ?? '',
    }

    if (data.destinationAddress) {
      const a = data.destinationAddress
      body['Recipient'] = {
        ContactPerson: a.name ?? '',
        Company: a.company ?? '',
        Address: a.street1 ?? '',
        LocalityName: a.city ?? '',
        CountyName: a.state ?? '',
        Zip: a.postalCode ?? '',
        Phone: a.phone ?? '',
        Email: a.email ?? '',
      }
    }

    if (data.originAddress) {
      const a = data.originAddress
      body['Sender'] = {
        ContactPerson: a.name ?? '',
        Company: a.company ?? '',
        Address: a.street1 ?? '',
        LocalityName: a.city ?? '',
        CountyName: a.state ?? '',
        Zip: a.postalCode ?? '',
        Phone: a.phone ?? '',
        Email: a.email ?? '',
      }
    }

    // POST /Awbs returns the barcode string of the created AWB.
    const barCode = await client.post<string>('Awbs', body)

    // Fetch the full AWB record using the returned barcode.
    const raw = await client.get<CargusAwb>(`Awbs/${encodeURIComponent(barCode)}`)
    return transformShipment({ ...raw, BarCode: barCode })
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new CargusClient(credentials)
    // DELETE /Awbs/{barCode} — delete/cancel the AWB.
    await client.delete(`Awbs/${encodeURIComponent(id)}`)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  /**
   * The trace of one AWB from `NoAuth_GetAwbTrace`, "Gets Awb trace by
   * barcode without authentication": `GET /api/NoAuth/GetAwbTrace?barCode={barCode}`
   * (portal: NoAuth_GetAwbTrace). The barcode is a query
   * parameter, not a path segment. An AWB with no events returns none.
   */
  async getTrackingEvents(
    credentials: Credentials,
    trackingNumber: string,
  ): Promise<TrackingEvent[]> {
    const client = new CargusClient(credentials)
    const packages = await client.get<CargusTracePackage[]>('NoAuth/GetAwbTrace', {
      barCode: trackingNumber,
    })
    return transformAwbTrace(Array.isArray(packages) ? packages : [], trackingNumber)
  }

  /**
   * Events from `AwbTrace_GetDeltaEvents`, "Get an array of events for
   * packages by date": `GET /api/AwbTrace/GetDeltaEvents?FromDate={FromDate}&ToDate={ToDate}`,
   * FromDate "Starting date for filter notes based on event date and filter
   * for list of events", both "required": true
   * (portal: AwbTrace_GetDeltaEvents). It documents no paging
   * parameter, so each UTC-day window is one upstream page and the events
   * flattened out of its AWBs are cut into the caller's pages by
   * `pageByRows`, newest window first. It documents no lookback limit, so a
   * call without `updatedAfter` is refused before any request.
   */
  async listTrackingEvents(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<TrackingEvent[]> {
    if (!params.updatedAfter) {
      throw notSupported(
        'Cargus cannot list tracking events without updated_after: its only event list, ' +
          'GET /api/AwbTrace/GetDeltaEvents?FromDate={FromDate}&ToDate={ToDate} ("Get an array ' +
          'of events for packages by date"), requires a FromDate/ToDate window and documents no ' +
          'lookback limit. Pass updated_after to walk the windows since then.',
      )
    }
    const w = dayWindows(params.updatedAfter)
    if (!w) {
      reportUpstreamPage(params, { hasMore: false })
      return []
    }
    const client = new CargusClient(credentials)
    const key = `cargus:${connectionScope('cargus', credentials)}:AwbTrace/GetDeltaEvents:${w.lower}:${w.top}`
    const { items } = await pageByRows<TrackingEvent, number>(
      key,
      params,
      async (cursor) => {
        const index = cursor ?? 0
        const res = await client.get<CargusDeltaAwb[]>(
          'AwbTrace/GetDeltaEvents',
          windowAt(w, index),
        )
        return {
          items: transformDeltaEvents(Array.isArray(res) ? res : []),
          next: index + 1 < w.count ? index + 1 : null,
        }
      },
      { maxUpstreamPages: w.count + 1 },
    )
    return items
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new CargusClient(credentials)

    const body: Record<string, unknown> = {
      TotalWeight: params.packages[0]?.weight?.value ?? 1,
      Parcels: params.packages.length || 1,
      Recipient: params.destinationAddress
        ? {
            LocalityName: params.destinationAddress.city ?? '',
            CountyName: params.destinationAddress.state ?? '',
            Zip: params.destinationAddress.postalCode ?? '',
            CountryName: params.destinationAddress.country ?? '',
          }
        : undefined,
      Sender: params.originAddress
        ? {
            LocalityName: params.originAddress.city ?? '',
            CountyName: params.originAddress.state ?? '',
            Zip: params.originAddress.postalCode ?? '',
            CountryName: params.originAddress.country ?? '',
          }
        : undefined,
    }

    const res = await client.post<CargusRate[]>('NoAuth/GetPriceEstimate', body)
    return (Array.isArray(res) ? res : []).map(transformRate)
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  /**
   * Cargus documents no label collection. Labels are printed per AWB by
   * `AwbDocuments_Get`, "Print awb labels":
   * `GET /api/AwbDocuments?barCodes={barCodes}&type={type}`, where barCodes
   * is "required": true (portal: AwbDocuments_Get), and the AWB
   * model of `Awbs_GetByDate` carries no label URL.
   */
  async listLabels(_credentials: Credentials, _params: QueryParams): Promise<Label[]> {
    throw notSupported(
      'Cargus cannot list labels: labels are printed per AWB by ' +
        'GET /api/AwbDocuments?barCodes={barCodes}&type={type} ("Print awb labels", barCodes ' +
        'required), and no documented AWB list carries a label URL.',
    )
  }

  /**
   * `GET /api/Awbs/label/{barCode}`, which this used to call, is not an
   * operation of the UrgentOnlineAPI. The documented label operation,
   * `AwbDocuments_Get` ("Print awb labels"), returns a body documented only
   * as `"string"` for type "PDF, HTML or ZPL", with no documented encoding,
   * so it cannot be mapped to a label URL or a base64 body without guessing.
   */
  async getLabel(_credentials: Credentials, _id: string): Promise<Label> {
    throw notSupported(
      'Cargus cannot return a label record: its only label operation, ' +
        'GET /api/AwbDocuments?barCodes={barCodes}&type={type} ("Print awb labels"), returns a ' +
        'body documented only as "string", with no documented URL or encoding.',
    )
  }

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    if (!data.shipmentId) throw new Error('shipmentId is required to generate a Cargus label')
    // For Cargus the AWB creation already generates the label; createLabel
    // re-fetches the label PDF for an existing AWB barcode.
    return this.getLabel(credentials, data.shipmentId)
  }

  async voidLabel(credentials: Credentials, id: string): Promise<void> {
    // Voiding a label means deleting/cancelling the AWB on Cargus.
    await this.cancelShipment(credentials, id)
  }

  // ── Orders (courier pickup requests) ───────────────────────────────────────

  /**
   * Courier pickup orders from `Orders_GetByDate`, "Get Orders by date with
   * pagination": `GET /api/Orders/GetByDate?FromDate={FromDate}&ToDate={ToDate}`
   * (FromDate "Start Date", ToDate "End Date", both "required": true) with
   * `pageNumber` / `itemsPerPage` (portal: Orders_GetByDate).
   * The other order list, `Orders_Get`, requires a `locationId` ("Punct de
   * lucru") and a `status` template parameter; a connection carries no
   * location id, and `locationId=0`, which this used to send, is not
   * documented. The portal documents no lookback limit, so a call without
   * `updatedAfter` is refused before any request.
   */
  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    if (!params.updatedAfter) {
      throw notSupported(
        'Cargus cannot list orders without updated_after: its date list, ' +
          'GET /api/Orders/GetByDate?FromDate={FromDate}&ToDate={ToDate} ("Get Orders by date ' +
          'with pagination"), requires a FromDate/ToDate window and documents no lookback limit, ' +
          'and GET /api/Orders?locationId={locationId}&status={status} requires a pickup ' +
          'location id the connection does not carry. Pass updated_after to walk the windows ' +
          'since then.',
      )
    }
    const client = new CargusClient(credentials)
    return walkPagedWindows<CargusOrder, Order>(
      client,
      credentials,
      'Orders/GetByDate',
      params.updatedAfter,
      params,
      transformOrder,
    )
  }

  /**
   * One order from `Orders_GetByOrderId`, "Get Orders by Id":
   * `GET /api/Orders/GetByOrderId` with query parameter `orderId`. The
   * documented response is one order object.
   */
  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new CargusClient(credentials)
    const raw = await client.get<CargusOrder | ''>('Orders/GetByOrderId', { orderId: id })
    if (!raw || typeof raw !== 'object') {
      throw Object.assign(new Error(`Cargus order not found: ${id}`), { statusCode: 404 })
    }
    return transformOrder(raw)
  }

  // ── Warehouses (pickup locations) ──────────────────────────────────────────

  async listWarehouses(credentials: Credentials, params: QueryParams): Promise<Warehouse[]> {
    const client = new CargusClient(credentials)
    // GET /PickupLocations — lists active pickup locations for the authenticated user.
    // The portal documents no paging parameter (only idPickupLocation), so one
    // response is the whole collection: page it locally.
    const res = await client.get<CargusPickupLocation[]>('PickupLocations')
    return pageLocally((Array.isArray(res) ? res : []).map(transformWarehouse), params)
  }

  async getWarehouse(credentials: Credentials, id: string): Promise<Warehouse> {
    const warehouses = await this.listWarehouses(credentials, {})
    const found = warehouses.find((w) => w.id === id)
    if (!found) throw new Error(`Cargus pickup location not found: ${id}`)
    return found
  }
}
