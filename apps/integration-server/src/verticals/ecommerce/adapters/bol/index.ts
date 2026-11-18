/**
 * Bol.com adapter for the ecommerce vertical.
 *
 * Maps the Bol.com Retailer API to canonical ecommerce resources. Bol.com is
 * the leading marketplace in the Netherlands and Belgium.
 *
 * Slug: `bol`
 * Platform identifier: `bol`
 * Auth: OAuth2 client-credentials (no user consent URL)
 * Base URL: https://api.bol.com/retailer/
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Implemented (20):
 *
 *   Products:     list, get, create, update, delete  (Offers API)
 *   Inventory:    list, get, set                     (Inventory/Offers API)
 *   Orders:       list, get                          (Orders API)
 *   Fulfillments: list, get, create                  (Shipments API)
 *   Refunds:      list, get                          (Returns API)
 *
 * Omitted (22) — the registry will return HTTP 501 automatically:
 *
 *   Variants (5)    — Bol.com offers are single-SKU, no variant hierarchy.
 *   Collections (5) — Bol.com has no user-mutable collections.
 *   Locations (2)   — Bol.com does not expose warehouse locations.
 *   Customers (5)   — Bol.com does not expose buyer data.
 *   Discounts (5)   — Bol.com has no discount/coupon API.
 *   createOrder, updateOrder, cancelOrder — buyers create orders.
 *   createRefund — returns are buyer-initiated.
 *   updateFulfillment, cancelFulfillment — not supported.
 *   adjustInventoryLevel — use setInventoryLevel instead.
 *   Transactions (3) — Bol.com financial data is in separate invoicing portal.
 *
 * Webhooks: Bol.com push notifications (subscription-based) — basic parser
 * implemented.
 */

// ── Resource coverage ──────────────────────────────────────────────────────────
// Unavailable: collection    — Bol.com marketplace has no user-mutable collections; no collections endpoint exists.
// Unavailable: customer      — Bol.com does not expose buyer/customer profile data via the Retailer API.
// Unavailable: discount      — Bol.com has no discount-code/coupon API; Promotions endpoint covers platform-managed campaigns only.
// Unavailable: location      — Bol.com does not expose warehouse or fulfillment-center location data.
// Unavailable: transaction   — Financial data is available only as monthly billing invoices, not per-order payment transactions.

import type { Credentials, QueryParams } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { InventoryLevel } from '../../schema/inventory'
import type { Order } from '../../schema/order'
import type { Fulfillment } from '../../schema/fulfillment'
import type { Refund } from '../../schema/refund'
import type { WebhookEvent } from '../../schema/webhook'

import { oauth2ClientCredentials } from '@opensteward/shared'
import { obtainAccessToken, refreshCredentials as bolRefreshCredentials } from './auth'
import { BolClient } from './client'
import {
  OFFERS_BASE,
  ORDERS_BASE,
  SHIPMENTS_BASE,
  RETURNS_BASE,
  INVENTORY_BASE,
  OAUTH_TOKEN_URL,
} from './constants'

const CREDENTIAL_FORM = oauth2ClientCredentials({ tokenUrl: OAUTH_TOKEN_URL })
import {
  transformProduct,
  untransformProduct,
  type RawBolOffer,
} from './transform/product'
import {
  transformOrder,
  type RawBolOrder,
} from './transform/order'
import {
  transformFulfillment,
  transformFulfillments,
  untransformFulfillment,
  type RawBolShipment,
} from './transform/fulfillment'
import {
  transformRefund,
  transformRefunds,
  type RawBolReturn,
} from './transform/refund'
import {
  transformInventoryLevel,
  type RawBolInventoryOffer,
} from './transform/inventory'

// ── Response envelopes ────────────────────────────────────────────────────────

interface RawOffersEnvelope {
  offers?: RawBolOffer[]
}

interface RawOrdersEnvelope {
  orders?: RawBolOrder[]
}

interface RawShipmentsEnvelope {
  shipments?: RawBolShipment[]
}

interface RawReturnsEnvelope {
  returns?: RawBolReturn[]
}

interface RawInventoryEnvelope {
  inventory?: RawBolInventoryOffer[]
}

export interface BolAdapterConfig {
  /** Bol.com API client id. */
  clientId?: string
  /** Bol.com API client secret. */
  clientSecret?: string
}

export class BolAdapter implements EcommerceAdapter {
  readonly platform = 'bol'
  readonly version = '0.1.0'

  credentialFields = CREDENTIAL_FORM.credentialFields
  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  private configClientId: string | undefined
  private configClientSecret: string | undefined

  constructor(config: BolAdapterConfig = {}) {
    this.configClientId = config.clientId
    this.configClientSecret = config.clientSecret
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    // Bol.com uses client-credentials — no user consent URL needed.
    // Return a placeholder that explains the flow.
    throw new Error(
      'Bol.com uses OAuth2 client-credentials grant. No user consent URL is needed. ' +
        'Provide clientId and clientSecret directly when creating a connection.',
    )
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    // Client-credentials flow — exchange is done via refreshCredentials.
    const clientId = this.configClientId
    const clientSecret = this.configClientSecret
    if (!clientId || !clientSecret) {
      throw new Error(
        'Bol.com adapter exchangeCode requires clientId and clientSecret — ' +
          'configure them in apps/integration-server/config/config.yml under adapters.bol.',
      )
    }
    return obtainAccessToken(clientId, clientSecret)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return bolRefreshCredentials(credentials)
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────

  verifyWebhookSignature(
    _payload: Record<string, unknown>,
    headers: Record<string, string>,
  ): boolean {
    // Bol.com push notifications include a signature header for verification.
    // This adapter only checks that the header is present; it does not verify
    // the signature value.
    const sig = headers['x-bol-signature']
    return typeof sig === 'string' && sig.length > 0
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    const topic = payload['topic'] as string | undefined
    const resourceId = payload['resourceId'] as string | undefined

    let resourceType: WebhookEvent['resourceType'] = 'unknown'
    let action: WebhookEvent['action'] = 'unknown'

    if (topic) {
      const lower = topic.toLowerCase()
      if (lower.includes('offer')) {
        resourceType = 'products'
      } else if (lower.includes('order')) {
        resourceType = 'orders'
      } else if (lower.includes('shipment')) {
        resourceType = 'fulfillments'
      } else if (lower.includes('return')) {
        resourceType = 'refunds'
      }

      if (lower.includes('create')) {
        action = 'created'
      } else if (lower.includes('update') || lower.includes('change')) {
        action = 'updated'
      } else if (lower.includes('delete') || lower.includes('cancel')) {
        action = 'deleted'
      }
    }

    return [
      {
        id: (payload['id'] as string | undefined) ?? undefined,
        platform: 'bol',
        type: topic ?? 'unknown',
        resourceType,
        action,
        resourceId: resourceId ?? 'unknown',
        payload,
      },
    ]
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private clientFor(credentials: Credentials): BolClient {
    return new BolClient(credentials)
  }

  // ── Products (Offers API) ──────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const client = this.clientFor(credentials)
    const page = (params.page as number | undefined) ?? 1
    const res = await client.get<RawOffersEnvelope>(OFFERS_BASE, { page })
    return (res.offers ?? []).map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.clientFor(credentials).get<RawBolOffer>(
      `${OFFERS_BASE}/${encodeURIComponent(id)}`,
    )
    if (!res.offerId) res.offerId = id
    return transformProduct(res)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const body = untransformProduct(data)
    const res = await this.clientFor(credentials).post<RawBolOffer>(
      OFFERS_BASE,
      body,
    )
    const offerId = res.offerId ?? data.id
    if (!offerId) {
      throw new Error('Bol.com createProduct: no offerId returned')
    }
    return this.getProduct(credentials, offerId)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const body = untransformProduct(data)
    await this.clientFor(credentials).put<unknown>(
      `${OFFERS_BASE}/${encodeURIComponent(id)}`,
      body,
    )
    return this.getProduct(credentials, id)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(
      `${OFFERS_BASE}/${encodeURIComponent(id)}`,
    )
  }

  // ── Inventory (Inventory API + Offers stock) ──────────────────────────────

  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    const client = this.clientFor(credentials)
    const page = (params.page as number | undefined) ?? 1
    const res = await client.get<RawInventoryEnvelope>(INVENTORY_BASE, { page })
    return (res.inventory ?? []).map(transformInventoryLevel)
  }

  async getInventoryLevel(credentials: Credentials, id: string): Promise<InventoryLevel> {
    // Canonical id is `${ean}:bol-default`; extract the EAN.
    const ean = id.includes(':') ? id.split(':')[0]! : id
    const client = this.clientFor(credentials)
    const res = await client.get<RawInventoryEnvelope>(INVENTORY_BASE, {
      search: ean,
    })
    const match = res.inventory?.find((i) => i.ean === ean || i.bsku === ean)
    if (!match) {
      throw new Error(`Bol.com getInventoryLevel: no inventory found for '${ean}'`)
    }
    return transformInventoryLevel(match)
  }

  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    const client = this.clientFor(credentials)
    // Bol.com stock updates go through the offer update endpoint.
    // We need the offerId — use variantId as the offer reference/EAN.
    // First, find the offer that matches.
    const res = await client.get<RawInventoryEnvelope>(INVENTORY_BASE, {
      search: data.variantId,
    })
    const match = res.inventory?.find(
      (i) => i.ean === data.variantId || i.bsku === data.variantId,
    )
    if (!match) {
      throw new Error(
        `Bol.com setInventoryLevel: no inventory found for '${data.variantId}'`,
      )
    }
    // Update stock via offers endpoint.
    const offerId = (match as Record<string, unknown>)['offerId'] as string | undefined
    if (offerId) {
      await client.put<unknown>(
        `${OFFERS_BASE}/${encodeURIComponent(offerId)}/stock`,
        { amount: data.available, managedByRetailer: true },
      )
    }
    return {
      id: `${data.variantId}:bol-default`,
      variantId: data.variantId,
      locationId: 'bol-default',
      available: data.available,
      metadata: match as unknown as Record<string, unknown>,
    }
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = this.clientFor(credentials)
    const page = (params.page as number | undefined) ?? 1
    const qp: Record<string, unknown> = { page }
    const fulfilmentMethod = params['fulfilmentMethod'] as string | undefined
    if (fulfilmentMethod) qp['fulfilment-method'] = fulfilmentMethod
    const status = params['status'] as string | undefined
    if (status) qp['status'] = status
    const res = await client.get<RawOrdersEnvelope>(ORDERS_BASE, qp)
    return (res.orders ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const res = await this.clientFor(credentials).get<RawBolOrder>(
      `${ORDERS_BASE}/${encodeURIComponent(id)}`,
    )
    return transformOrder(res)
  }

  // ── Fulfillments (Shipments API) ──────────────────────────────────────────

  async listFulfillments(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Fulfillment[]> {
    const client = this.clientFor(credentials)
    const page = (params.page as number | undefined) ?? 1
    const qp: Record<string, unknown> = { page }
    const orderId = (params['orderId'] ?? params['order_id']) as string | undefined
    if (orderId) qp['order-id'] = orderId
    const res = await client.get<RawShipmentsEnvelope>(SHIPMENTS_BASE, qp)
    return transformFulfillments(res.shipments)
  }

  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    const res = await this.clientFor(credentials).get<RawBolShipment>(
      `${SHIPMENTS_BASE}/${encodeURIComponent(id)}`,
    )
    return transformFulfillment(res)
  }

  async createFulfillment(
    credentials: Credentials,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    const body = untransformFulfillment(data)
    const res = await this.clientFor(credentials).post<RawBolShipment>(
      SHIPMENTS_BASE,
      body,
    )
    const shipmentId = res.shipmentId
    if (!shipmentId) {
      throw new Error('Bol.com createFulfillment: no shipmentId returned')
    }
    return this.getFulfillment(credentials, String(shipmentId))
  }

  // ── Refunds (Returns API) ────────────────────────────────────────────────

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const client = this.clientFor(credentials)
    const page = (params.page as number | undefined) ?? 1
    const qp: Record<string, unknown> = { page }
    const handled = params['handled'] as boolean | undefined
    if (handled !== undefined) qp['handled'] = handled
    const res = await client.get<RawReturnsEnvelope>(RETURNS_BASE, qp)
    return transformRefunds(res.returns)
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const res = await this.clientFor(credentials).get<RawBolReturn>(
      `${RETURNS_BASE}/${encodeURIComponent(id)}`,
    )
    return transformRefund(res)
  }
}
