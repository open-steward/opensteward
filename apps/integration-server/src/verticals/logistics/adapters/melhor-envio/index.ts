import type { LogisticsAdapter, Credentials, RateRequestParams } from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Label } from '../../schema/label'
import type { Carrier } from '../../schema/carrier'
import type { Order } from '../../schema/order'
import type { QueryParams } from '@opensteward/shared'
import { connectionScope, cursorPagerKey, pageByRows, pageLocally } from '@opensteward/shared'

import {
  buildAuthUrl,
  exchangeCode as doExchangeCode,
  refreshCredentials as doRefresh,
  type MelhorEnvioAuthConfig,
} from './auth'
import { MelhorEnvioClient } from './client'
import { transformShipment, type MelhorEnvioShipment } from './transform/shipment'
import { transformTracking, type MelhorEnvioTrackingResponse } from './transform/tracking'
import { transformRate, type MelhorEnvioRate } from './transform/rate'
import { transformLabel, type MelhorEnvioLabel } from './transform/label'
import { transformCarrier, type MelhorEnvioCarrier } from './transform/carrier'
import { transformOrder, type MelhorEnvioOrder } from './transform/order'

// ── Resource coverage ──────────────────────────────────────────────────────────
// Unavailable: manifest  — No manifest endpoint exists in the Melhor Envio API (confirmed via full reference index)
// Unavailable: warehouse — No warehouse endpoint exists; Melhor Envio is a freight-quotation/label service only

// ─── Paging ───────────────────────────────────────────────────────────────────

/**
 * GET /me/cart and GET /me/orders return a page-numbered envelope. The
 * reference (docs.melhorenvio.com.br/reference/listar-itens-do-carrinho and
 * /listar-etiquetas) documents `page` only through the page URLs
 * (`"first_page_url": ".../me/orders?page=1"`) and signals the end with
 * `"next_page_url": null`; `per_page` (10) appears only in the response, so
 * the caller's limit cannot size an upstream page. Caller pages are cut out of
 * the `page` chain by rows.
 */
interface MelhorEnvioPageEnvelope<T> {
  data?: T[]
  next_page_url?: string | null
}

async function pageMelhorEnvio<Raw, Out>(
  client: MelhorEnvioClient,
  account: string,
  credentials: Credentials,
  path: string,
  params: QueryParams,
  transform: (raw: Raw) => Out,
): Promise<Out[]> {
  const key = cursorPagerKey(connectionScope(account, credentials), path, {})
  const { items } = await pageByRows<Out, number>(key, params, async (page) => {
    const current = page ?? 1
    const res = await client.get<MelhorEnvioPageEnvelope<Raw> | Raw[]>(path, { page: current })
    if (Array.isArray(res)) return { items: res.map(transform), next: null }
    return {
      items: (res?.data ?? []).map(transform),
      next: res?.next_page_url ? current + 1 : null,
    }
  })
  return items
}

// ─── Adapter config ───────────────────────────────────────────────────────────

export interface MelhorEnvioAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  sandbox?: boolean
}

// ─── Adapter ──────────────────────────────────────────────────────────────────

export class MelhorEnvioAdapter implements LogisticsAdapter {
  readonly platform = 'melhor-envio'
  readonly version = '1'

  private readonly authConfig: MelhorEnvioAuthConfig

  constructor(config: MelhorEnvioAdapterConfig) {
    this.authConfig = {
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUri: config.redirectUri,
      sandbox: config.sandbox ?? false,
    }
  }

  /** Walks are per environment and connection: sandbox and production are separate accounts. */
  private account(): string {
    return `melhor-envio:${this.authConfig.sandbox ? 'sandbox' : 'production'}`
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.authConfig, state, overrideScopes)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return doExchangeCode(code, this.authConfig)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Carriers ───────────────────────────────────────────────────────────────

  /**
   * List available carriers / shipping companies.
   * GET /api/v2/me/shipment/companies
   * (docs.melhorenvio.com.br/reference/listar-transportadoras): "Lista todas
   * as transportadoras disponíveis". The operation documents no query
   * parameter and its 200 schema is `"type": "array"`, so the whole list comes
   * back in one response and caller pages are cut from it with pageLocally.
   * Anything but the documented array is refused: pageLocally would otherwise
   * report an empty, complete collection.
   */
  async listCarriers(credentials: Credentials, params: QueryParams): Promise<Carrier[]> {
    const client = new MelhorEnvioClient(credentials, this.authConfig.sandbox)
    const raw = await client.get<unknown>('me/shipment/companies')
    if (!Array.isArray(raw)) {
      throw new Error('melhor-envio: GET me/shipment/companies did not return the documented array')
    }
    return pageLocally((raw as MelhorEnvioCarrier[]).map(transformCarrier), params)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  /**
   * Calculate freight rates.
   * POST /api/v2/me/shipment/calculate
   *
   * Accepts either product-level or volume-level packages.
   * Melhor Envio returns one element per carrier/service combination.
   * Elements with an `error` field are silently skipped.
   */
  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new MelhorEnvioClient(credentials, this.authConfig.sandbox)
    const firstPkg = params.packages[0]

    const body: Record<string, unknown> = {
      from: {
        postal_code: params.originAddress.postalCode,
      },
      to: {
        postal_code: params.destinationAddress.postalCode,
      },
      options: {
        insurance_value: 0,
        receipt: false,
        own_hand: false,
        collect: false,
      },
    }

    if (firstPkg) {
      // Use volumes format (pre-calculated packages).
      body['volumes'] = params.packages.map((pkg) => ({
        weight: pkg.weight?.value ?? 0,
        width: pkg.dimensions?.width ?? 0,
        height: pkg.dimensions?.height ?? 0,
        length: pkg.dimensions?.length ?? 0,
      }))
    }

    const raw = await client.post<MelhorEnvioRate[]>('me/shipment/calculate', body)

    return (raw ?? [])
      .filter((r) => !r.error)
      .map(transformRate)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  /**
   * List shipments in the cart / order history.
   * GET /api/v2/me/cart
   */
  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new MelhorEnvioClient(credentials, this.authConfig.sandbox)
    return pageMelhorEnvio<MelhorEnvioShipment, Shipment>(
      client,
      this.account(),
      credentials,
      'me/cart',
      params,
      transformShipment,
    )
  }

  /**
   * Get a single shipment by cart item ID.
   * GET /api/v2/me/cart/:id
   */
  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new MelhorEnvioClient(credentials, this.authConfig.sandbox)
    const raw = await client.get<MelhorEnvioShipment>(`me/cart/${encodeURIComponent(id)}`)
    return transformShipment(raw)
  }

  /**
   * Add a freight to the cart (equivalent to "create shipment" for Melhor Envio).
   * POST /api/v2/me/cart
   *
   * The body mirrors the calculate endpoint but adds recipient/sender info.
   */
  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new MelhorEnvioClient(credentials, this.authConfig.sandbox)

    const body: Record<string, unknown> = {
      service: data.serviceCode,
      from: data.originAddress
        ? {
            name: data.originAddress.name,
            company: data.originAddress.company,
            address: data.originAddress.street1,
            complement: data.originAddress.street2,
            city: data.originAddress.city,
            state_abbr: data.originAddress.state,
            postal_code: data.originAddress.postalCode,
            phone: data.originAddress.phone,
            email: data.originAddress.email,
          }
        : undefined,
      to: data.destinationAddress
        ? {
            name: data.destinationAddress.name,
            company: data.destinationAddress.company,
            address: data.destinationAddress.street1,
            complement: data.destinationAddress.street2,
            city: data.destinationAddress.city,
            state_abbr: data.destinationAddress.state,
            postal_code: data.destinationAddress.postalCode,
            phone: data.destinationAddress.phone,
            email: data.destinationAddress.email,
          }
        : undefined,
      volumes: data.packages
        ? data.packages.map((pkg) => ({
            weight: pkg.weight?.value ?? 0,
            width: pkg.dimensions?.width ?? 0,
            height: pkg.dimensions?.height ?? 0,
            length: pkg.dimensions?.length ?? 0,
          }))
        : data.totalWeight
          ? [{ weight: data.totalWeight.value, width: 0, height: 0, length: 0 }]
          : undefined,
      options: {
        insurance_value: data.cost?.amount ?? 0,
        receipt: false,
        own_hand: false,
        collect: false,
      },
      tag: data.reference,
    }

    const raw = await client.post<MelhorEnvioShipment>('me/cart', body)
    return transformShipment(raw)
  }

  /**
   * Cancel / remove a cart item.
   * DELETE /api/v2/me/cart/:id
   */
  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new MelhorEnvioClient(credentials, this.authConfig.sandbox)
    await client.delete(`me/cart/${encodeURIComponent(id)}`)
  }

  // ── Tracking ───────────────────────────────────────────────────────────────

  /**
   * Retrieve tracking events for a shipment by tracking number.
   * POST /api/v2/me/shipment/tracking
   *
   * The API accepts a POST body with an `orders` array of tracking codes and
   * returns a dictionary keyed by order ID.
   */
  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new MelhorEnvioClient(credentials, this.authConfig.sandbox)
    const res = await client.post<Record<string, MelhorEnvioTrackingResponse>>(
      'me/shipment/tracking',
      { orders: [trackingNumber] },
    )
    // Response is a dict keyed by order ID; extract the entry for our code.
    const raw: MelhorEnvioTrackingResponse =
      (res ?? {})[trackingNumber] ?? Object.values(res ?? {})[0] ?? {}
    return transformTracking(raw)
  }

  // ── Orders ─────────────────────────────────────────────────────────────────

  /**
   * List all orders (paid cart items / shipping labels) for the account.
   * GET /api/v2/me/orders
   *
   * Requires the `orders-read` OAuth scope.
   * Returns a paginated envelope: { data: MelhorEnvioOrder[], ... }.
   */
  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new MelhorEnvioClient(credentials, this.authConfig.sandbox)
    return pageMelhorEnvio<MelhorEnvioOrder, Order>(
      client,
      this.account(),
      credentials,
      'me/orders',
      params,
      transformOrder,
    )
  }

  /**
   * Get a single order by ID.
   * GET /api/v2/me/orders/:id
   */
  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new MelhorEnvioClient(credentials, this.authConfig.sandbox)
    const raw = await client.get<MelhorEnvioOrder>(`me/orders/${encodeURIComponent(id)}`)
    return transformOrder(raw)
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  /**
   * Generate a label for a purchased shipment.
   * POST /api/v2/me/shipment/generate
   *
   * Accepts an array of cart item IDs (orders).
   */
  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    const client = new MelhorEnvioClient(credentials, this.authConfig.sandbox)
    const cartId = data.shipmentId ?? data.id
    const res = await client.post<MelhorEnvioLabel | MelhorEnvioLabel[]>(
      'me/shipment/generate',
      { orders: cartId ? [cartId] : [] },
    )
    // The API returns an array; we take the first element.
    const item = Array.isArray(res) ? res[0] : res
    return transformLabel(item as MelhorEnvioLabel)
  }

  /**
   * Get the print URL for a generated label.
   * GET /api/v2/me/shipment/print
   */
  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    const client = new MelhorEnvioClient(credentials, this.authConfig.sandbox)
    const raw = await client.get<MelhorEnvioLabel>('me/shipment/print', {
      orders: [id],
      start_at: undefined,
      end_at: undefined,
    })
    return transformLabel(raw)
  }
}
