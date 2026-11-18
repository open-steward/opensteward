import { oauth2ClientCredentials, pageLocally } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
  RateRequestParams,
} from '../../adapter/interface'
import type { Carrier } from '../../schema/carrier'
import type { Shipment } from '../../schema/shipment'
import type { Order } from '../../schema/order'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Label } from '../../schema/label'

import { fetchClientCredentialsToken, refreshCredentials as doRefresh } from './auth'
import { Parcel2GoClient } from './client'
import {
  PARCEL2GO_AUTH_TOKEN_URL,
  PARCEL2GO_SCOPES,
  SERVICES_PAGE_SIZE,
  MAX_SERVICES_PAGES,
} from './constants'

import { transformShipment, type Parcel2GoShipment } from './transform/shipment'
import { transformRate, type Parcel2GoQuote } from './transform/rate'
import { transformLabel, type Parcel2GoLabelResponse } from './transform/label'
import { transformTrackingResult, type Parcel2GoTrackingResult } from './transform/tracking'
import { transformOrder, type Parcel2GoOrderResponse } from './transform/order'
import {
  carriersFromServices,
  type Parcel2GoService,
  type Parcel2GoServiceResults,
} from './transform/carrier'

/**
 * The 501 a method with no documented Parcel2Go endpoint throws before any
 * request is sent. The sync worker skips a resource on exactly this error.
 */
function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

// Swagger 2.0, https://www.parcel2go.com/api/swagger/docs/v1. The only
// order listing is GET /me/orders/detail: "Gets the currently logged in
// user's 25 most recent orders." It takes no parameters at all, so nothing
// older than the 25 is reachable, and serving it as a list would tell the
// sync the collection is complete.
const ORDERS_CAPPED_REASON =
  'GET /me/orders/detail is the only order listing, and it "Gets the currently logged in user\'s 25 most recent orders." with no paging, offset or date parameter to reach older ones'

// ── Resource coverage ──────────────────────────────────────────────
// Source: the public Swagger 2.0 document, https://www.parcel2go.com/api/swagger/docs/v1.
// It has no manifest and no warehouse path. Shipments and orders cannot be
// listed (GET /me/orders/detail is capped at the 25 most recent); carriers
// are read from the GET /services catalogue.

export interface Parcel2GoAdapterConfig {
  clientId?: string
  clientSecret?: string
  redirectUri?: string
  sandbox?: boolean
}

// Connect-Link credential form: standard OAuth2 client_credentials template.
const CREDENTIAL_FORM = oauth2ClientCredentials({
  tokenUrl: PARCEL2GO_AUTH_TOKEN_URL,
  scopes: PARCEL2GO_SCOPES,
})

export class Parcel2GoAdapter implements LogisticsAdapter {
  readonly platform = 'parcel2go'
  readonly version = '1'

  // Connect Link support — OAuth2 client_credentials form.
  credentialFields = CREDENTIAL_FORM.credentialFields
  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  private clientId: string
  private clientSecret: string
  private sandbox: boolean

  constructor(config: Parcel2GoAdapterConfig = {}) {
    this.clientId = config.clientId ?? ''
    this.clientSecret = config.clientSecret ?? ''
    this.sandbox = config.sandbox ?? false
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    // Parcel2Go uses client_credentials — no user-facing authorization URL.
    // Return the dashboard URL so the Connect Link can show a helpful redirect.
    return 'https://www.parcel2go.com/smart-send'
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    // For Parcel2Go client_credentials flow, the "code" is unused.
    // Credentials are obtained via the credential form / exchangeCredentials.
    return fetchClientCredentialsToken(this.clientId, this.clientSecret, this.sandbox)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async listShipments(_credentials: Credentials, _params: QueryParams): Promise<Shipment[]> {
    // The Swagger has no "orderlines" path; order lines are listed only inside
    // GET /me/orders/detail, which is capped at the 25 most recent orders.
    throw notSupported(`Parcel2Go cannot list shipments: ${ORDERS_CAPPED_REASON}`)
  }

  async getShipment(_credentials: Credentials, _id: string): Promise<Shipment> {
    // No GET path in the Swagger reads one order line by id. The GETs that
    // take an order line (/tracking/{orderLineId}, /labels/{reference},
    // /invoices/{reference}) return its tracking, labels or invoices, never
    // the order line itself.
    throw notSupported(
      'Parcel2Go cannot read a shipment by id: the API documents no GET for an order line ' +
        '(GET /tracking/{orderLineId}, /labels/{reference} and /invoices/{reference} return its ' +
        'tracking, labels or invoices, not the order line)',
    )
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    // Parcel2Go creates a shipment by placing an order — delegate to createOrder logic.
    const client = new Parcel2GoClient(credentials)
    const raw = await client.post<Parcel2GoOrderResponse>('order', {
      slug: data.serviceCode,
      weight: data.totalWeight?.value,
      length: data.dimensions?.length,
      width: data.dimensions?.width,
      height: data.dimensions?.height,
      collectionCountry: data.originAddress?.country,
      collectionPostcode: data.originAddress?.postalCode,
      collectionProperty: data.originAddress?.street1,
      collectionStreet: data.originAddress?.street2 ?? data.originAddress?.street1,
      collectionTown: data.originAddress?.city,
      collectionCounty: data.originAddress?.state,
      collectionName: data.originAddress?.name,
      collectionEmail: data.originAddress?.email,
      collectionPhone: data.originAddress?.phone,
      deliveryCountry: data.destinationAddress?.country,
      deliveryPostcode: data.destinationAddress?.postalCode,
      deliveryProperty: data.destinationAddress?.street1,
      deliveryStreet: data.destinationAddress?.street2 ?? data.destinationAddress?.street1,
      deliveryTown: data.destinationAddress?.city,
      deliveryCounty: data.destinationAddress?.state,
      deliveryName: data.destinationAddress?.name,
      deliveryEmail: data.destinationAddress?.email,
      deliveryPhone: data.destinationAddress?.phone,
      specialInstructions: data.notes,
    })
    // Return the primary order-line as a Shipment
    const orderLineId = raw.OrderLineId ?? (raw.OrderlineIdMap ? Object.values(raw.OrderlineIdMap)[0] : undefined)
    return transformShipment({
      OrderLineId: orderLineId,
      OrderId: raw.OrderId ?? undefined,
      Slug: raw.Slug ?? undefined,
      TotalPrice: raw.TotalPrice ?? undefined,
      CollectionAddress: raw.CollectionAddress ?? undefined,
      DeliveryAddress: raw.DeliveryAddress ?? undefined,
      Status: 'Booked',
      CreatedAt: raw.CreatedAt ?? new Date().toISOString(),
    } as Parcel2GoShipment)
  }

  // ── Orders ─────────────────────────────────────────────────────────────────

  async listOrders(_credentials: Credentials, _params: QueryParams): Promise<Order[]> {
    // GET /orders is "Gets an order." — a lookup by orderId + hash, not a list.
    throw notSupported(`Parcel2Go cannot list orders: ${ORDERS_CAPPED_REASON}`)
  }

  async getOrder(_credentials: Credentials, _id: string): Promise<Order> {
    // The documented lookup is GET /orders?orderId=&hash=, with hash "required
    // when the client doesn't have explicit user permissions" — which a
    // client_credentials connection does not have. The hash is not derivable
    // from the order id, and /orders/{id} is not a documented path.
    throw notSupported(
      'Parcel2Go cannot read an order by id alone: GET /orders requires the order\'s "hash", ' +
        '"required when the client doesn\'t have explicit user permissions"',
    )
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new Parcel2GoClient(credentials)
    const raw = await client.post<Parcel2GoOrderResponse>('order', {
      slug: data.requestedServiceCode,
      collectionCountry: data.originAddress?.country,
      collectionPostcode: data.originAddress?.postalCode,
      collectionProperty: data.originAddress?.street1,
      collectionStreet: data.originAddress?.street2 ?? data.originAddress?.street1,
      collectionTown: data.originAddress?.city,
      collectionCounty: data.originAddress?.state,
      collectionName: data.originAddress?.name,
      collectionEmail: data.originAddress?.email,
      collectionPhone: data.originAddress?.phone,
      deliveryCountry: data.destinationAddress?.country,
      deliveryPostcode: data.destinationAddress?.postalCode,
      deliveryProperty: data.destinationAddress?.street1,
      deliveryStreet: data.destinationAddress?.street2 ?? data.destinationAddress?.street1,
      deliveryTown: data.destinationAddress?.city,
      deliveryCounty: data.destinationAddress?.state,
      deliveryName: data.destinationAddress?.name,
      deliveryEmail: data.destinationAddress?.email,
      deliveryPhone: data.destinationAddress?.phone,
      specialInstructions: data.notes,
    })
    return transformOrder(raw)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new Parcel2GoClient(credentials)
    const raw = await client.get<Parcel2GoTrackingResult>(`tracking/${trackingNumber}`)
    return transformTrackingResult(raw, trackingNumber)
  }

  async listTrackingEvents(credentials: Credentials, params: QueryParams): Promise<TrackingEvent[]> {
    // Parcel2Go does not expose a bulk tracking list endpoint; fall back to
    // fetching by a single trackingNumber from params if provided.
    const id = params.id as string | undefined
    if (!id) return []
    return this.getTrackingEvents(credentials, id)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new Parcel2GoClient(credentials)
    const pkg = params.packages[0]
    const res = await client.post<Parcel2GoQuote[] | { Quotes?: Parcel2GoQuote[] }>('quote', {
      collectionCountry: params.originAddress.country ?? 'GB',
      collectionPostcode: params.originAddress.postalCode,
      deliveryCountry: params.destinationAddress.country ?? 'GB',
      deliveryPostcode: params.destinationAddress.postalCode,
      weight: pkg?.weight?.value,
      length: pkg?.dimensions?.length,
      width: pkg?.dimensions?.width,
      height: pkg?.dimensions?.height,
      includeCover: false,
    })
    const quotes = Array.isArray(res) ? res : (res.Quotes ?? [])
    return quotes.map(transformRate)
  }

  // ── Carriers (couriers) ────────────────────────────────────────────────────

  /**
   * Every row of GET /services ("Get a list of active services"), walked with
   * its documented offset parameters: take "Number of services to get
   * (default 50)." and skip "Number of services to skip (default 0).". The
   * response documents that "There may be less services returned than the
   * requested amount", so a short page is not taken as the end: the walk
   * stops on the first page with no rows.
   */
  private async fetchAllServices(credentials: Credentials): Promise<Parcel2GoService[]> {
    const client = new Parcel2GoClient(credentials)
    const all: Parcel2GoService[] = []
    for (let pageIndex = 0; pageIndex < MAX_SERVICES_PAGES; pageIndex++) {
      const res = await client.get<Parcel2GoServiceResults>('services', {
        take: SERVICES_PAGE_SIZE,
        skip: pageIndex * SERVICES_PAGE_SIZE,
      })
      const rows = res?.Results ?? []
      if (rows.length === 0) return all
      all.push(...rows)
    }
    throw new Error(
      `Parcel2Go GET /services returned rows past ${MAX_SERVICES_PAGES * SERVICES_PAGE_SIZE} services; refusing to serve a truncated carrier list`,
    )
  }

  async listCarriers(credentials: Credentials, params: QueryParams): Promise<Carrier[]> {
    // Carriers are grouped over the whole catalogue, then paged locally, so
    // each courier is one row and the total is exact.
    const carriers = carriersFromServices(await this.fetchAllServices(credentials))
    return pageLocally(carriers, params)
  }

  async getCarrier(credentials: Credentials, id: string): Promise<Carrier> {
    // No courier-by-id path is documented; a courier is found by its
    // CourierSlug in the service catalogue.
    const carrier = carriersFromServices(await this.fetchAllServices(credentials)).find(
      (c) => c.id === id,
    )
    if (!carrier) {
      throw Object.assign(new Error(`Parcel2Go has no active service from courier "${id}"`), {
        statusCode: 404,
        code: 'NOT_FOUND',
      })
    }
    return carrier
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    const client = new Parcel2GoClient(credentials)
    const raw = await client.get<Parcel2GoLabelResponse>(`labels/${id}`)
    return transformLabel(raw, id)
  }

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    if (!data.shipmentId) throw new Error('shipmentId is required to generate a Parcel2Go label')
    const client = new Parcel2GoClient(credentials)
    const hash = (data.metadata as Record<string, unknown> | undefined)?.['hash'] as string | undefined
    const raw = await client.post<Parcel2GoLabelResponse>('label', {
      orderId: data.shipmentId,
      hash: hash ?? '',
      labelSize: 'A4',
    })
    return transformLabel(raw, data.shipmentId, data.trackingNumber, data.carrierId)
  }
}
