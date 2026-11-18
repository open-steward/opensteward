/**
 * Aimeos adapter for the ecommerce vertical.
 *
 * Maps the Aimeos JSON:API surface to the canonical ecommerce resources.
 * Notable Aimeos characteristics:
 *
 *  - **Self-hosted**: The JSON API entry point depends on the host application,
 *    so the Connect Link form collects it as `credentials.extra.apiUrl`
 *    (e.g. `https://shop.example.com/admin/default/jsonadm`). Older connections
 *    that stored only `extra.baseUrl` resolve to `{baseUrl}/api`.
 *  - **JSON:API format**: Resources at `{apiUrl}/{resource}`. Content-Type is
 *    `application/vnd.api+json`. All resources use the raw envelope
 *    `{data: {type, id, attributes, relationships}}`.
 *  - **Dot-notation attributes**: All attribute keys use dot-notation
 *    within the JSON:API attributes object (e.g. `product.label`).
 *  - **Auth**: Static Bearer token generated in Aimeos admin panel.
 *    No token refresh — tokens are long-lived until revoked.
 *  - **Stock model**: Stock records (`/api/stock`) are per-product + type.
 *    Locations are virtual (derived from stock `type` field).
 *  - **Order split**: Orders have a base record (`order/base`) with
 *    address and pricing data separate from the main order record.
 *
 * Coverage: 25 of 42 interface methods implemented.
 *   Products: listProducts, getProduct, createProduct, updateProduct, deleteProduct
 *   Variants: listVariants, getVariant
 *   Orders: listOrders, getOrder, cancelOrder
 *   Customers: listCustomers, getCustomer, createCustomer, updateCustomer
 *   Fulfillments: listFulfillments, getFulfillment
 *   Inventory: listInventoryLevels, getInventoryLevel, setInventoryLevel
 *   Locations: listLocations, getLocation
 *   Collections: listCollections, getCollection
 *   Discounts: listDiscounts, getDiscount
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: refund — Aimeos has no dedicated refund endpoint; refunds are
 *              processed externally via payment gateway callbacks and reflected
 *              only as payment status changes on orders.
 * Unavailable: transaction — Aimeos has no dedicated payment transaction
 *              endpoint; payment processing is delegated to external service
 *              providers with no transaction listing API.
 */

import type { Credentials, QueryParams } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product, ProductVariant } from '../../schema/product'
import type { Collection } from '../../schema/collection'
import type { Location } from '../../schema/location'
import type { InventoryLevel } from '../../schema/inventory'
import type { Customer } from '../../schema/customer'
import type { Order } from '../../schema/order'
import type { Fulfillment } from '../../schema/fulfillment'
import type { Discount } from '../../schema/discount'

import {
  getAuthUrl as aimeosGetAuthUrl,
  exchangeCode as aimeosExchangeCode,
  refreshCredentials as aimeosRefreshCredentials,
} from './auth'
import { AimeosClient } from './client'
import { AIMEOS_FORM } from './connect-form'
import { DEFAULT_PAGE_SIZE } from './constants'

import {
  transformProduct,
  transformVariant,
  untransformProduct,
  type AimeosProduct,
} from './transform/product'
import {
  transformOrder,
  type AimeosOrder,
  type AimeosOrderBase,
  type AimeosOrderProduct,
} from './transform/order'
import {
  transformCustomer,
  untransformCustomer,
  type AimeosCustomer,
} from './transform/customer'
import {
  transformFulfillment,
  type AimeosService,
} from './transform/fulfillment'
import {
  transformInventoryLevel,
  transformStockLocation,
  buildInventoryLevel,
  type AimeosStock,
} from './transform/inventory'
import {
  transformCollection,
  type AimeosCatalog,
} from './transform/collection'
import {
  transformDiscount,
  type AimeosCoupon,
} from './transform/discount'

export interface AimeosAdapterConfig {
  baseUrl?: string
}

export class AimeosAdapter implements EcommerceAdapter {
  // Connect Link support — JSON API URL + token (see ./connect-form).
  credentialFields = AIMEOS_FORM.credentialFields
  exchangeCredentials = AIMEOS_FORM.exchangeCredentials

  readonly platform = 'aimeos'
  readonly version = '0.1.0'

  private configBaseUrl: string | undefined

  constructor(config: AimeosAdapterConfig = {}) {
    this.configBaseUrl = config.baseUrl
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return aimeosGetAuthUrl(state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return aimeosExchangeCode(code, redirectUri)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return aimeosRefreshCredentials(credentials)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private clientFor(credentials: Credentials): AimeosClient {
    // Connect Link connections carry the full JSON API entry point.
    if (credentials.extra?.['apiUrl']) {
      return new AimeosClient(credentials)
    }
    const baseUrl =
      (credentials.extra?.['baseUrl'] as string | undefined) ?? this.configBaseUrl
    if (!baseUrl) {
      throw new Error(
        'AimeosAdapter: the JSON API URL is required. Reconnect through Connect Link, ' +
          'or POST credentials to /v1/connections with ' +
          'credentials: {accessToken, extra: {apiUrl}}.',
      )
    }
    const mergedCreds: Credentials = {
      ...credentials,
      extra: { ...credentials.extra, baseUrl },
    }
    return new AimeosClient(mergedCreds)
  }

  private pageOffset(params: QueryParams): { offset: number; limit: number } {
    const page = params.page ?? 1
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    return { offset: (page - 1) * limit, limit }
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const { offset, limit } = this.pageOffset(params)
    const res = await this.clientFor(credentials).list('/product', { offset, limit })
    return res.items.map((raw) => transformProduct(raw as unknown as AimeosProduct))
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const raw = await this.clientFor(credentials).get(`/product/${encodeURIComponent(id)}`)
    return transformProduct(raw as unknown as AimeosProduct)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const body = untransformProduct(data)
    const raw = await this.clientFor(credentials).post('/product', body)
    return transformProduct(raw as unknown as AimeosProduct)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const body = untransformProduct(data) as { data: Record<string, unknown> }
    body.data['id'] = id
    const raw = await this.clientFor(credentials).patch(
      `/product/${encodeURIComponent(id)}`,
      body,
    )
    return transformProduct(raw as unknown as AimeosProduct)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`/product/${encodeURIComponent(id)}`)
  }

  // ── Variants ──────────────────────────────────────────────────────────────

  async listVariants(credentials: Credentials, params: QueryParams): Promise<ProductVariant[]> {
    const { offset, limit } = this.pageOffset(params)
    const productId = (params['productId'] ?? params['product_id']) as string | undefined
    const filters: Record<string, string> = {}
    if (productId) {
      // Filter variants whose parent product ID matches
      filters['product.parentid'] = productId
    }
    const res = await this.clientFor(credentials).list('/product', {
      offset,
      limit,
      filters: { ...filters, 'product.type': 'default' },
    })
    return res.items.map((raw) =>
      transformVariant(raw as unknown as AimeosProduct, undefined, productId),
    )
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    const raw = await this.clientFor(credentials).get(`/product/${encodeURIComponent(id)}`)
    return transformVariant(raw as unknown as AimeosProduct)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const { offset, limit } = this.pageOffset(params)
    const res = await this.clientFor(credentials).list('/order', {
      offset,
      limit,
      sort: '-order.ctime',
    })
    return res.items.map((raw) => transformOrder(raw as unknown as AimeosOrder))
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = this.clientFor(credentials)
    const raw = await client.get(`/order/${encodeURIComponent(id)}`)
    const order = raw as unknown as AimeosOrder
    const baseId = order.attributes['order.baseid']

    let base: AimeosOrderBase | undefined
    let lineItems: AimeosOrderProduct[] | undefined

    if (baseId) {
      try {
        const baseRaw = await client.get(`/order/base/${encodeURIComponent(String(baseId))}`)
        base = baseRaw as unknown as AimeosOrderBase

        const productsRes = await client.list('/order/base/product', {
          filters: { 'order.base.product.baseid': String(baseId) },
          limit: 100,
        })
        lineItems = productsRes.items as unknown as AimeosOrderProduct[]
      } catch {
        // order base fetch is best-effort
      }
    }

    return transformOrder(order, base, lineItems)
  }

  async cancelOrder(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Order> {
    const raw = await this.clientFor(credentials).patch(`/order/${encodeURIComponent(id)}`, {
      data: {
        type: 'order',
        id,
        attributes: {
          'order.statusdelivery': -1,
          'order.statuspayment': 1,
        },
      },
    })
    return transformOrder(raw as unknown as AimeosOrder)
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const { offset, limit } = this.pageOffset(params)
    const res = await this.clientFor(credentials).list('/customer', {
      offset,
      limit,
      filters: { 'customer.status': '1' },
    })
    return res.items.map((raw) => transformCustomer(raw as unknown as AimeosCustomer))
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const raw = await this.clientFor(credentials).get(`/customer/${encodeURIComponent(id)}`)
    return transformCustomer(raw as unknown as AimeosCustomer)
  }

  async createCustomer(credentials: Credentials, data: Partial<Customer>): Promise<Customer> {
    const body = untransformCustomer(data)
    const raw = await this.clientFor(credentials).post('/customer', body)
    return transformCustomer(raw as unknown as AimeosCustomer)
  }

  async updateCustomer(
    credentials: Credentials,
    id: string,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const body = untransformCustomer(data) as { data: Record<string, unknown> }
    body.data['id'] = id
    const raw = await this.clientFor(credentials).patch(
      `/customer/${encodeURIComponent(id)}`,
      body,
    )
    return transformCustomer(raw as unknown as AimeosCustomer)
  }

  // ── Fulfillments (synthesised from orders) ────────────────────────────────

  async listFulfillments(credentials: Credentials, params: QueryParams): Promise<Fulfillment[]> {
    const { offset, limit } = this.pageOffset(params)
    const res = await this.clientFor(credentials).list('/order', {
      offset,
      limit,
      sort: '-order.ctime',
    })
    return res.items.map((raw) => transformFulfillment(raw as unknown as AimeosOrder))
  }

  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    const client = this.clientFor(credentials)
    const raw = await client.get(`/order/${encodeURIComponent(id)}`)
    const order = raw as unknown as AimeosOrder
    const baseId = order.attributes['order.baseid']

    let deliveryService: AimeosService | undefined
    if (baseId) {
      try {
        const servicesRes = await client.list('/order/base/service', {
          filters: {
            'order.base.service.baseid': String(baseId),
            'order.base.service.type': 'delivery',
          },
          limit: 10,
        })
        if (servicesRes.items.length > 0) {
          deliveryService = servicesRes.items[0] as unknown as AimeosService
        }
      } catch {
        // delivery service fetch is best-effort
      }
    }

    return transformFulfillment(order, deliveryService)
  }

  // ── Inventory Levels ──────────────────────────────────────────────────────

  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    const { offset, limit } = this.pageOffset(params)
    const filters: Record<string, string> = {}
    const productId = (params['productId'] ?? params['product_id']) as string | undefined
    if (productId) {
      filters['stock.productid'] = productId
    }
    const res = await this.clientFor(credentials).list('/stock', { offset, limit, filters })
    return res.items.map((raw) => transformInventoryLevel(raw as unknown as AimeosStock))
  }

  async getInventoryLevel(credentials: Credentials, id: string): Promise<InventoryLevel> {
    // id may be synthesised as `{productId}:{stockType}`
    const colonIdx = id.indexOf(':')
    if (colonIdx > -1) {
      const productId = id.slice(0, colonIdx)
      const stockType = id.slice(colonIdx + 1)
      const res = await this.clientFor(credentials).list('/stock', {
        filters: { 'stock.productid': productId, 'stock.type': stockType },
        limit: 1,
      })
      if (res.items.length > 0) {
        return transformInventoryLevel(res.items[0] as unknown as AimeosStock)
      }
      // synthesise if not found
      return buildInventoryLevel({ variantId: productId, locationId: stockType, available: 0 })
    }
    const raw = await this.clientFor(credentials).get(`/stock/${encodeURIComponent(id)}`)
    return transformInventoryLevel(raw as unknown as AimeosStock)
  }

  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    // Find existing stock record by productid + type
    const res = await this.clientFor(credentials).list('/stock', {
      filters: {
        'stock.productid': data.variantId,
        'stock.type': data.locationId,
      },
      limit: 1,
    })

    const patchBody = {
      data: {
        type: 'stock',
        attributes: {
          'stock.stocklevel': data.available,
          'stock.productid': data.variantId,
          'stock.type': data.locationId,
        },
      },
    }

    if (res.items.length > 0) {
      const stockId = res.items[0]!.id
      const patchBodyWithId = {
        data: { ...patchBody.data, id: stockId },
      }
      const raw = await this.clientFor(credentials).patch(
        `/stock/${encodeURIComponent(stockId)}`,
        patchBodyWithId,
      )
      return transformInventoryLevel(raw as unknown as AimeosStock)
    }

    // Create new stock record if not found
    const raw = await this.clientFor(credentials).post('/stock', patchBody)
    return transformInventoryLevel(raw as unknown as AimeosStock)
  }

  // ── Locations (synthesised from stock types) ──────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const { offset, limit } = this.pageOffset(params)
    const res = await this.clientFor(credentials).list('/stock', { offset, limit })
    // Deduplicate by stock.type
    const seen = new Set<string>()
    const locations: Location[] = []
    for (const raw of res.items) {
      const stockRaw = raw as unknown as AimeosStock
      const stockType = (stockRaw.attributes['stock.type'] as string | undefined) ?? 'default'
      if (!seen.has(stockType)) {
        seen.add(stockType)
        locations.push(transformStockLocation(stockRaw))
      }
    }
    return locations
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    // id is the stock type string; fetch a stock record of that type
    const res = await this.clientFor(credentials).list('/stock', {
      filters: { 'stock.type': id },
      limit: 1,
    })
    if (res.items.length > 0) {
      return transformStockLocation(res.items[0] as unknown as AimeosStock)
    }
    // Synthesise a minimal location if no stock records exist for this type
    return {
      id,
      name: id.charAt(0).toUpperCase() + id.slice(1).replace(/-/g, ' '),
      active: true,
      isFulfillmentCenter: true,
      metadata: { synthetic: true, stockType: id },
    }
  }

  // ── Collections (catalog categories) ─────────────────────────────────────────

  async listCollections(credentials: Credentials, params: QueryParams): Promise<Collection[]> {
    const { offset, limit } = this.pageOffset(params)
    const res = await this.clientFor(credentials).list('/catalog', { offset, limit })
    return res.items.map((raw) => transformCollection(raw as unknown as AimeosCatalog))
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const raw = await this.clientFor(credentials).get(`/catalog/${encodeURIComponent(id)}`)
    return transformCollection(raw as unknown as AimeosCatalog)
  }

  // ── Discounts (coupons) ───────────────────────────────────────────────────────

  async listDiscounts(credentials: Credentials, params: QueryParams): Promise<Discount[]> {
    const { offset, limit } = this.pageOffset(params)
    const res = await this.clientFor(credentials).list('/coupon', { offset, limit })
    return res.items.map((raw) => transformDiscount(raw as unknown as AimeosCoupon))
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const raw = await this.clientFor(credentials).get(`/coupon/${encodeURIComponent(id)}`)
    return transformDiscount(raw as unknown as AimeosCoupon)
  }
}
