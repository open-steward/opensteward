// ── Resource coverage ──────────────────────────────────────────────
// Available:  rate, shipment, trackingevent, order
// Unavailable: carrier — Geodis is itself the sole carrier; no multi-carrier catalog endpoint exists in their API
// Unavailable: warehouse — warehouses are configured server-side in the GEODIS WMS; no warehouse CRUD endpoint is exposed
// Unverified:  label — label/AWB generation is referenced in third-party docs but the endpoint path is behind an authenticated portal and was not publicly verifiable
// Unverified:  manifest — end-of-day manifest generation is referenced in third-party docs but the endpoint path is behind an authenticated portal and was not publicly verifiable
//
// The first-party API is the GEODIS Americas WMS API Postman collection
// (https://docs.api.geodis.com/api/collections/23261785/2s8YzUyhAw?segregateAuth=true&versionTag=latest).
// Its "WMS API" folder holds Order (POST /api/order/v1, POST /api/order/cancel/v1),
// Shipment Confirmation (GET /api/ShipmentConfirmation/v1), Item Master Request,
// InventoryInquiry, Goods Receipts Request and Goods Receipt Confirmation.

import { connectionScope, customForm, pageByRows, reportUpstreamPage } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
  RateRequestParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Order } from '../../schema/order'

import {
  buildAuthUrl,
  credentialExtra,
  ensureFreshToken,
  generateToken,
  refreshCredentials as doRefresh,
} from './auth'
import { GeodisClient } from './client'
import {
  SHIPMENT_CONFIRMATION_LOOKBACK_DAYS,
  SHIPMENT_CONFIRMATION_PAGE_SIZE,
  SHIPMENT_CONFIRMATION_WINDOW_DAYS,
} from './constants'

import { transformShipment, type GeodisShipment } from './transform/shipment'
import { transformRate, type GeodisRate } from './transform/rate'
import { transformOrder, type GeodisOrder } from './transform/order'
import {
  transformShipmentConfirmationOrder,
  type GeodisShipmentConfirmationResponse,
} from './transform/shipment-confirmation'

interface GeodisAdapterConfig {
  sandbox?: boolean
}

const DAY_MS = 86_400_000

/** `YYYY-MM-DD"T"24HH:MI:SS`, the documented StartDate/EndDate format, read in UTC. */
function wmsDateTime(ms: number): string {
  return new Date(ms).toISOString().slice(0, 19)
}

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

/**
 * Connect Link form. GenerateToken authenticates with basic auth
 * ("username", "password"), and every WMS call needs "CustomerId": "Customer
 * ID Provided By Geodis; Mandatory".
 */
const GEODIS_FORM = customForm({
  fields: [
    {
      name: 'username',
      label: 'Username',
      type: 'text',
      helpText: 'The GenerateToken username issued by GEODIS integration support.',
      required: true,
    },
    { name: 'password', label: 'Password', type: 'password', required: true },
    {
      name: 'customerId',
      label: 'Customer ID',
      type: 'text',
      helpText: 'Customer ID Provided By Geodis.',
      required: true,
    },
  ],
  async exchange(input) {
    const username = (input['username'] ?? '').trim()
    const password = input['password'] ?? ''
    const customerId = (input['customerId'] ?? '').trim()
    if (!username || !password || !customerId) {
      throw new Error('Username, password and Customer ID are required.')
    }
    return generateToken({ username, password, customerId })
  },
})

export class GeodisAdapter implements LogisticsAdapter {
  // Connect Link support: GenerateToken's username and password, plus the customer id.
  credentialFields = GEODIS_FORM.credentialFields

  exchangeCredentials = GEODIS_FORM.exchangeCredentials

  readonly platform = 'geodis'
  readonly version = '1'

  constructor(_config: GeodisAdapterConfig = {}) {}

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return { accessToken: code }
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  private async client(credentials: Credentials): Promise<GeodisClient> {
    return new GeodisClient(await ensureFreshToken(credentials))
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  /**
   * Refused before any request. The collection's WMS API documents no
   * tracking endpoint (only Order, Shipment Confirmation, Item Master Request,
   * InventoryInquiry, Goods Receipts Request and Goods Receipt Confirmation);
   * the old `GET tracking/{trackingNumber}` path is not in it.
   */
  async getTrackingEvents(
    _credentials: Credentials,
    _trackingNumber: string,
  ): Promise<TrackingEvent[]> {
    throw notSupported(
      'GEODIS cannot read tracking events: its WMS API documents no tracking endpoint ' +
        '(only Order, Shipment Confirmation, Item Master Request, InventoryInquiry, Goods ' +
        'Receipts Request and Goods Receipt Confirmation).',
    )
  }

  /** Refused before any request, for the same reason as `getTrackingEvents`. */
  async listTrackingEvents(
    _credentials: Credentials,
    _params: QueryParams,
  ): Promise<TrackingEvent[]> {
    throw notSupported(
      'GEODIS cannot list tracking events: its WMS API documents no tracking endpoint ' +
        '(only Order, Shipment Confirmation, Item Master Request, InventoryInquiry, Goods ' +
        'Receipts Request and Goods Receipt Confirmation).',
    )
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = await this.client(credentials)
    const raw = await client.post<GeodisShipment>('shipments', {
      sender: data.originAddress
        ? {
            name: data.originAddress.name,
            company: data.originAddress.company,
            street1: data.originAddress.street1,
            street2: data.originAddress.street2,
            city: data.originAddress.city,
            state: data.originAddress.state,
            postal_code: data.originAddress.postalCode,
            country: data.originAddress.country,
            phone: data.originAddress.phone,
            email: data.originAddress.email,
          }
        : undefined,
      recipient: data.destinationAddress
        ? {
            name: data.destinationAddress.name,
            company: data.destinationAddress.company,
            street1: data.destinationAddress.street1,
            street2: data.destinationAddress.street2,
            city: data.destinationAddress.city,
            state: data.destinationAddress.state,
            postal_code: data.destinationAddress.postalCode,
            country: data.destinationAddress.country,
            phone: data.destinationAddress.phone,
            email: data.destinationAddress.email,
          }
        : undefined,
      weight: data.totalWeight
        ? { value: data.totalWeight.value, unit: data.totalWeight.unit }
        : undefined,
      reference: data.reference,
      service_code: data.serviceCode,
    })
    return transformShipment(raw)
  }

  // ── Orders ─────────────────────────────────────────────────────────────────

  /**
   * Shipped outbound orders, from GetShipmentConfirmation:
   * `GET /api/ShipmentConfirmation/v1`. "Shipment Confirmation is used to
   * return shipped outbound orders within given date range. Difference between
   * dates cannot exceed 96 hours, or beyond 45 days from current date."
   *
   * Query: "CustomerId ... Mandatory" (from the connection), "StartDate
   * ... Mandatory; YYYY-MM-DD"T"24HH:MI:SS", "EndDate ... Mandatory",
   * "pageNumber" and "pageSize ... Minimum User Setting 100; Maximum User
   * Setting 1000". The answer is `{pagedResponse: {..., nextPage}, response:
   * {order: [...]}}`, and the documented last page has `"nextPage": null`.
   *
   * The walk runs through `pageByRows` over four-day (96-hour) windows
   * anchored to UTC calendar days, newest first: today and the three days
   * before it, then the four days before those, and so on down to the older
   * of the documented 45-day limit (the first whole UTC day inside it) and
   * the day of `updatedAfter`. Within a window it asks for pageNumber 1, 2,
   * ... at the documented maximum page size until `nextPage` is null.
   * `updatedAfter` bounds the walk by that day as a whole: the rows'
   * `shipmentDate` carries no zone, so the day is not cut further.
   */
  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const { customerId } = credentialExtra(credentials)
    if (!customerId) {
      throw notSupported(
        'GEODIS cannot list orders without a Customer ID: GetShipmentConfirmation requires ' +
          '"CustomerId ... Customer ID Provided By Geodis; Mandatory". Reconnect GEODIS with ' +
          'its username, password and Customer ID.',
      )
    }
    const now = Date.now()
    const top = Math.floor(now / DAY_MS) * DAY_MS
    const oldest = Math.ceil((now - SHIPMENT_CONFIRMATION_LOOKBACK_DAYS * DAY_MS) / DAY_MS) * DAY_MS
    const after = params.updatedAfter
      ? Math.floor(params.updatedAfter.getTime() / DAY_MS) * DAY_MS
      : undefined
    const bottom = after !== undefined && after > oldest ? after : oldest
    if (bottom > top) {
      reportUpstreamPage(params, { hasMore: false })
      return []
    }
    const days = (top - bottom) / DAY_MS + 1
    const windows = Math.ceil(days / SHIPMENT_CONFIRMATION_WINDOW_DAYS)
    const client = await this.client(credentials)
    const scope = connectionScope('geodis', {
      accessToken: `${credentialExtra(credentials).username ?? credentials.accessToken}\u0000${customerId}`,
    })
    const key =
      `geodis:${scope}:shipment-confirmation:${customerId}:` +
      `${wmsDateTime(bottom)}:${wmsDateTime(top)}:${SHIPMENT_CONFIRMATION_PAGE_SIZE}`
    const { items } = await pageByRows<Order, string>(key, params, async (cursor) => {
      const [w, p] = (cursor ?? '0:1').split(':').map(Number) as [number, number]
      const endDay = top - w * SHIPMENT_CONFIRMATION_WINDOW_DAYS * DAY_MS
      const startDay = Math.max(bottom, endDay - (SHIPMENT_CONFIRMATION_WINDOW_DAYS - 1) * DAY_MS)
      const res = await client.get<GeodisShipmentConfirmationResponse>(
        'api/ShipmentConfirmation/v1',
        {
          CustomerId: customerId,
          StartDate: wmsDateTime(startDay),
          EndDate: wmsDateTime(endDay + DAY_MS - 1000),
          pageNumber: p,
          pageSize: SHIPMENT_CONFIRMATION_PAGE_SIZE,
        },
      )
      const rows = res.response?.order ?? []
      const paged = res.pagedResponse
      if (!paged && rows.length > 0) {
        throw new Error(
          'GEODIS GetShipmentConfirmation returned orders without pagedResponse; cannot tell whether more pages follow',
        )
      }
      const windowHasMore = paged?.nextPage != null
      const next = windowHasMore ? `${w}:${p + 1}` : w + 1 < windows ? `${w + 1}:1` : null
      return { items: rows.map(transformShipmentConfirmationOrder), next }
    })
    return items
  }

  /**
   * Create an outbound order.
   *
   * POST /api/order/v1
   */
  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = await this.client(credentials)
    const body: Record<string, unknown> = {
      order_number: data.orderNumber,
      customer_id: data.customerId,
      warehouse_id: data.warehouseId,
      service_code: data.requestedServiceCode,
      notes: data.notes,
      currency: data.currency,
      ship_to: data.destinationAddress
        ? {
            name: data.destinationAddress.name,
            company: data.destinationAddress.company,
            address1: data.destinationAddress.street1,
            address2: data.destinationAddress.street2,
            city: data.destinationAddress.city,
            state: data.destinationAddress.state,
            zip: data.destinationAddress.postalCode,
            country: data.destinationAddress.country,
            phone: data.destinationAddress.phone,
            email: data.destinationAddress.email,
          }
        : undefined,
      ship_from: data.originAddress
        ? {
            name: data.originAddress.name,
            company: data.originAddress.company,
            address1: data.originAddress.street1,
            address2: data.originAddress.street2,
            city: data.originAddress.city,
            state: data.originAddress.state,
            zip: data.originAddress.postalCode,
            country: data.originAddress.country,
            phone: data.originAddress.phone,
            email: data.originAddress.email,
          }
        : undefined,
      line_items: data.lineItems?.map((li) => ({
        sku: li.sku,
        description: li.name,
        quantity: li.quantity,
        unit_price: li.unitAmount,
      })),
    }
    const raw = await client.post<GeodisOrder>('api/order/v1', body)
    return transformOrder(raw)
  }

  /**
   * Cancel an order.
   *
   * POST /api/order/cancel/v1
   */
  async cancelOrder(credentials: Credentials, id: string): Promise<void> {
    const client = await this.client(credentials)
    await client.post('api/order/cancel/v1', { order_id: id })
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = await this.client(credentials)
    const firstPkg = params.packages[0]
    const body = {
      from: {
        postal_code: params.originAddress.postalCode,
        country: params.originAddress.country,
      },
      to: {
        postal_code: params.destinationAddress.postalCode,
        country: params.destinationAddress.country,
      },
      weight: firstPkg?.weight?.value,
      weight_unit: firstPkg?.weight?.unit,
      length: firstPkg?.dimensions?.length,
      width: firstPkg?.dimensions?.width,
      height: firstPkg?.dimensions?.height,
      service_codes: params.serviceCodes,
    }
    const res = await client.post<{ rates: GeodisRate[] }>('rates', body)
    return (res.rates ?? []).map(transformRate)
  }
}
