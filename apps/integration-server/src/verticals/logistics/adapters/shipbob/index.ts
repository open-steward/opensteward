// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: carrier  — No carrier-listing endpoint; carrier name is only an embedded string field on shipment responses (static reference table in docs, not API-queryable).
// Unavailable: label    — ShipBob manages shipping label generation internally; no label create/get endpoint is exposed in the public API.
// Unavailable: manifest — ShipBob does not expose end-of-day manifest creation or retrieval in their public API.
// rate: getRates only — POST /2026-01/order:estimate prices a hypothetical order (one all-in fulfilment price per shipping method), not a multi-carrier rate shop; needs `products` on the request, see getRates.

import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
  RateRequestParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { Order } from '../../schema/order'
import type { Warehouse } from '../../schema/warehouse'
import type { Carrier } from '../../schema/carrier'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'

import {
  buildAuthUrl,
  exchangeCode as doExchange,
  refreshCredentials as doRefresh,
  type ShipBobAuthConfig,
} from './auth'
import { ShipBobClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformOrder, type ShipBobOrder } from './transform/order'
import { transformShipment, type ShipBobShipment } from './transform/shipment'
import { transformWarehouse, type ShipBobFulfillmentCenter } from './transform/warehouse'
import { transformTracking } from './transform/tracking'
import { transformCarrier, type ShipBobShippingMethod } from './transform/carrier'
import { transformRate, type ShipBobEstimateResponse } from './transform/rate'

interface ShipBobAdapterConfig {
  clientId?: string
  clientSecret?: string
  redirectUri?: string
  scopes?: string[]
  /**
   * Point the whole adapter at ShipBob's staging environment.
   *
   * Apps created in the ShipBob sandbox are unknown to production, and the
   * production authorize endpoint refuses them with an error page that names
   * no cause. Set this when the OAuth app was created in the sandbox.
   */
  sandbox?: boolean
  /**
   * The name ShipBob knows this application by. Used at connect to pick this
   * app's channel out of `GET /channel`, which lists one channel per
   * authorized application and names none of them as the caller's.
   */
  appName?: string
}

/**
 * ShipBob's `EstimateProductInfoModel`: `quantity` plus one of `id` (the
 * inventory product id) or `reference_id` (the merchant SKU). This is the
 * shape `getRates` reads off `params.products`, unchanged.
 */
export interface ShipBobEstimateProduct {
  id?: number
  reference_id?: string
  quantity: number
}

function isEstimateProductList(value: unknown): value is ShipBobEstimateProduct[] {
  if (!Array.isArray(value) || value.length === 0) return false
  return value.every((p) => {
    if (p === null || typeof p !== 'object') return false
    const { id, reference_id, quantity } = p as Partial<ShipBobEstimateProduct>
    return typeof quantity === 'number' && (id != null || reference_id != null)
  })
}

export class ShipBobAdapter implements LogisticsAdapter {
  readonly platform = 'shipbob'
  readonly version = '1'

  /**
   * ShipBob's IdentityServer requires PKCE on the authorization-code flow —
   * `code_challenge` + `code_challenge_method=S256` are documented as
   * mandatory query parameters. Without them the authorize request is refused
   * before any consent screen, redirecting to
   * `auth.shipbob.com/home/error?errorId=…`, which names no cause.
   */
  readonly capabilities = { requiresPkce: true, supportsSandbox: true }

  private authConfig: ShipBobAuthConfig

  constructor(config: ShipBobAdapterConfig = {}) {
    this.authConfig = {
      clientId: config.clientId ?? '',
      clientSecret: config.clientSecret ?? '',
      redirectUri: config.redirectUri,
      scopes: config.scopes,
      sandbox: config.sandbox ?? false,
      appName: config.appName,
    }
  }

  // -- Auth -------------------------------------------------------------------

  getAuthUrl(state: string, overrideScopes?: string[], codeChallenge?: string): string {
    const config = overrideScopes ? { ...this.authConfig, scopes: overrideScopes } : this.authConfig
    return buildAuthUrl(config, state, codeChallenge)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return doExchange(this.authConfig, code, redirectUri)
  }

  async exchangeCodeWithVerifier(
    code: string,
    redirectUri: string,
    codeVerifier: string,
  ): Promise<Credentials> {
    return doExchange(this.authConfig, code, redirectUri, codeVerifier)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(this.authConfig, credentials)
  }

  // -- Orders -----------------------------------------------------------------

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new ShipBobClient(credentials, this.authConfig.sandbox ?? false)
    const res = await client.get<ShipBobOrder[]>('order', {
      Page: params.page ?? 1,
      Limit: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    })
    return (res ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new ShipBobClient(credentials, this.authConfig.sandbox ?? false)
    const raw = await client.get<ShipBobOrder>(`order/${id}`)
    return transformOrder(raw)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new ShipBobClient(credentials, this.authConfig.sandbox ?? false)
    // Channel-scoped: this attributes the new order to our channel.
    const raw = await client.post<ShipBobOrder>('order', {
      reference_id: data.orderNumber ?? data.id ?? `order-${Date.now()}`,
      order_number: data.orderNumber,
      shipping_method: data.requestedServiceCode ?? 'Standard',
      type: 'DTC',
      recipient: data.destinationAddress
        ? {
            name: data.destinationAddress.name ?? '',
            email: data.destinationAddress.email,
            phone_number: data.destinationAddress.phone,
            address: {
              address1: data.destinationAddress.street1 ?? '',
              address2: data.destinationAddress.street2,
              city: data.destinationAddress.city ?? '',
              state: data.destinationAddress.state,
              zip_code: data.destinationAddress.postalCode,
              country: data.destinationAddress.country ?? '',
              company_name: data.destinationAddress.company,
            },
          }
        : undefined,
      products: (data.lineItems ?? []).map((li) => ({
        reference_id: li.sku ?? li.id ?? '',
        name: li.name ?? '',
        quantity: li.quantity ?? 1,
        unit_price: li.unitAmount,
      })),
      financials: data.totalAmount != null
        ? { total_price: data.totalAmount }
        : undefined,
      purchase_date: data.orderAt?.toISOString(),
      gift_message: data.notes,
    }, { channelScoped: true })
    return transformOrder(raw)
  }

  async cancelOrder(credentials: Credentials, id: string): Promise<void> {
    const client = new ShipBobClient(credentials, this.authConfig.sandbox ?? false)
    await client.post<unknown>(`order/${id}/cancel`, {})
  }

  // -- Shipments --------------------------------------------------------------

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    // ShipBob shipments are nested under orders. List orders then flatten shipments.
    const client = new ShipBobClient(credentials, this.authConfig.sandbox ?? false)
    // Deliberately unfiltered. `HasTracking: true` was sent here, which asks
    // ShipBob for only the orders that already carry a tracking number — but a
    // shipment exists from the moment ShipBob accepts the order, and the
    // tracking number appears later, when a label is bought. Filtering on it
    // hid every shipment in between: a live sandbox with 25 orders and 25
    // `Processing` shipments listed none of them.
    const orders = await client.get<ShipBobOrder[]>('order', {
      Page: params.page ?? 1,
      Limit: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    })
    const shipmentIds = new Set<number>()
    const shipments: Shipment[] = []
    for (const order of orders ?? []) {
      for (const s of order.shipments ?? []) {
        if (!shipmentIds.has(s.id)) {
          shipmentIds.add(s.id)
          // Fetch full shipment details
          const full = await client.get<ShipBobShipment>(`order/${order.id}/shipment/${s.id}`)
          shipments.push(transformShipment(full))
        }
      }
    }
    return shipments
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    // Need orderId context; search params for the shipment
    const client = new ShipBobClient(credentials, this.authConfig.sandbox ?? false)
    // ShipBob requires orderId to get a shipment; try the shipment search endpoint
    const raw = await client.get<ShipBobShipment>(`shipment/${id}`)
    return transformShipment(raw)
  }

  // -- Warehouses -------------------------------------------------------------

  // -- Carriers ---------------------------------------------------------------

  /**
   * ShipBob exposes shipping METHODS, not carriers — it picks the carrier per
   * shipment from its own contracts. `/carrier` does not exist (404 when
   * probed); `/shipping-method` is the real endpoint. See transform/carrier.ts.
   */
  async listCarriers(credentials: Credentials, _params: QueryParams): Promise<Carrier[]> {
    const client = new ShipBobClient(credentials, this.authConfig.sandbox ?? false)
    // Unpaginated upstream — it returns the account's full set, four rows on a
    // stock sandbox — so `page`/`limit` are deliberately not forwarded.
    const methods = await client.get<ShipBobShippingMethod[]>('shipping-method')
    return (methods ?? []).map((m) => transformCarrier(m))
  }

  async getCarrier(credentials: Credentials, id: string): Promise<Carrier> {
    const client = new ShipBobClient(credentials, this.authConfig.sandbox ?? false)
    // No by-id route either, so the single row is selected from the list. The
    // collection is small and unpaginated, which is what makes this honest
    // rather than a hidden full-table scan.
    const methods = await client.get<ShipBobShippingMethod[]>('shipping-method')
    const found = (methods ?? []).find((m) => String(m.id) === String(id))
    if (!found) throw new Error(`ShipBob shipping method ${id} not found`)
    return transformCarrier(found)
  }

  async listWarehouses(credentials: Credentials, _params: QueryParams): Promise<Warehouse[]> {
    const client = new ShipBobClient(credentials, this.authConfig.sandbox ?? false)
    const res = await client.get<ShipBobFulfillmentCenter[]>('fulfillment-center')
    return (res ?? []).map(transformWarehouse)
  }

  async getWarehouse(credentials: Credentials, id: string): Promise<Warehouse> {
    const client = new ShipBobClient(credentials, this.authConfig.sandbox ?? false)
    // ShipBob fulfillment centers list endpoint; filter by id client-side
    const all = await client.get<ShipBobFulfillmentCenter[]>('fulfillment-center')
    const fc = (all ?? []).find((f) => String(f.id) === id)
    if (!fc) throw new Error(`Fulfillment center ${id} not found`)
    return transformWarehouse(fc)
  }

  // -- Rates ------------------------------------------------------------------

  /**
   * `POST /order:estimate` is a fulfilment-cost estimate, not a carrier rate
   * shop (see transform/rate.ts). It prices a hypothetical ORDER, so it needs
   * the inventory products that order would contain — which
   * `RateRequestParams` (addresses + packages) has no field for. They ride
   * the index signature as `products`, in ShipBob's own shape:
   *
   *     products: [{ reference_id: 'TShirtBlueM', quantity: 1 }]  // merchant SKU — prefer this
   *     products: [{ id: 23403772, quantity: 2 }]                  // ShipBob VARIANT id
   *
   * Live check against the sandbox (2026-09-13): `reference_id` resolves on
   * every channel; `id` is the variant id (`product.variants[].id`, not the
   * product id) and resolves only on the channel that owns the variant's
   * channel_metadata — the wrong channel or the product-level id answers
   * "No products found for provided ChannelId". The estimator then requires
   * inventory dimensions ShipBob has VALIDATED by physically receiving stock;
   * user-entered variant dimensions do not count, so a sandbox account gets a
   * vendor 500 "Some inventory items do not have dimension data" for every
   * SKU. That is a data precondition, not a request error, and it is passed
   * through as-is.
   *
   * `originAddress` is not sent: ShipBob picks the fulfilment centre itself
   * and names it on each estimate. `serviceCodes` narrows the quote to those
   * shipping methods; omitted, ShipBob quotes every method on the account.
   * The endpoint also requires the `shipbob_channel_id` header, which the
   * client sets from `credentials.extra.channelId`.
   */
  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const products = params.products
    if (!isEstimateProductList(products)) {
      throw new Error(
        'ShipBob order:estimate needs `products` — RateRequestParams carries no line items. ' +
          'Pass `products: [{ reference_id: <sku> | id: <variant id>, quantity: <n> }]` ' +
          'alongside the addresses (reference_id resolves on every channel; id is the ' +
          'ShipBob variant id, not the product id).',
      )
    }
    const client = new ShipBobClient(credentials, this.authConfig.sandbox ?? false)
    const dest = params.destinationAddress
    const res = await client.post<ShipBobEstimateResponse>('order:estimate', {
      // `EstimationAddressViewModel` is additionalProperties:false, so only
      // its own keys go over the wire — no name, phone or email. `country`
      // is the one it requires (ISO alpha-2, which Address already is).
      address: {
        address1: dest.street1,
        address2: dest.street2,
        city: dest.city,
        state: dest.state,
        zip_code: dest.postalCode,
        country: dest.country,
        company_name: dest.company,
      },
      products,
      shipping_methods: params.serviceCodes,
    }, { channelScoped: true })
    return (res.estimates ?? []).map(transformRate)
  }

  // -- Tracking Events --------------------------------------------------------

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    // ShipBob doesn't have a dedicated tracking-by-number endpoint.
    // Search orders with tracking and match by tracking number.
    const client = new ShipBobClient(credentials, this.authConfig.sandbox ?? false)
    const orders = await client.get<ShipBobOrder[]>('order', {
      HasTracking: true,
      Limit: MAX_PAGE_SIZE,
    })
    const events: TrackingEvent[] = []
    for (const order of orders ?? []) {
      for (const s of order.shipments ?? []) {
        if ((s.tracking?.tracking_number ?? s.tracking_number) === trackingNumber) {
          const full = await client.get<ShipBobShipment>(
            `order/${order.id}/shipment/${s.id}`,
          )
          events.push(...transformTracking(full))
        }
      }
    }
    return events
  }

  async listTrackingEvents(credentials: Credentials, params: QueryParams): Promise<TrackingEvent[]> {
    const client = new ShipBobClient(credentials, this.authConfig.sandbox ?? false)
    // Unfiltered for the same reason as `listShipments`. A shipment's status
    // is a reportable event on its own — `transformTracking` maps
    // `Processing` to IN_TRANSIT — so the absence of a tracking number is not
    // the absence of an event. `getTrackingEvents` below still filters,
    // because it searches for one specific tracking number.
    const orders = await client.get<ShipBobOrder[]>('order', {
      Page: params.page ?? 1,
      Limit: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    })
    const events: TrackingEvent[] = []
    for (const order of orders ?? []) {
      for (const s of order.shipments ?? []) {
        // Build a lightweight ShipBobShipment from order-level shipment data
        const shipment: ShipBobShipment = {
          id: s.id,
          order_id: (order as ShipBobOrder).id,
          reference_id: null,
          status: s.status,
          created_date: order.created_date,
          last_update_at: null,
          estimated_fulfillment_date: null,
          actual_fulfillment_date: null,
          delivery_date: null,
          // Carry the nested object through. Populating only the flat
          // `tracking_number` left carrier and service permanently absent on
          // every event, because that is where ShipBob actually puts them.
          tracking: s.tracking ?? null,
          tracking_number: s.tracking?.tracking_number ?? s.tracking_number,
          tracking_url: s.tracking?.tracking_url ?? null,
          carrier: s.tracking?.carrier ?? null,
          carrier_service: s.tracking?.carrier_service ?? null,
          ship_option: null,
          invoice_amount: null,
          invoice_currency_code: null,
          measurements: null,
          recipient: null,
          location: null,
          products: null,
          status_details: null,
          gift_message: null,
          require_signature: null,
          insurance_value: null,
          is_tracking_uploaded: null,
        }
        events.push(...transformTracking(shipment))
      }
    }
    return events
  }
}
