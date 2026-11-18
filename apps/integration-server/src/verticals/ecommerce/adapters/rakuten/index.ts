import { simpleApiKey } from '@opensteward/shared'
/**
 * Rakuten Ichiba / RMS adapter for the ecommerce vertical.
 *
 * Maps Rakuten's Merchant Server (RMS) API to canonical ecommerce resources.
 * Rakuten Ichiba is Japan's largest marketplace (~4.6B items, 50K+ stores).
 *
 * ── Auth model ──────────────────────────────────────────────────────────────
 *
 * Rakuten RMS uses static key-pair authentication — no OAuth, no token
 * refresh. Every request carries an `Authorization: ESA …` header built
 * from `base64(serviceSecret:licenseKey)`.
 *
 * Credentials layout:
 *   - `accessToken`             = applicationId (public catalog API)
 *   - `extra.licenseKey`        = RMS license key (required for RMS)
 *   - `extra.serviceSecret`     = RMS service secret (required for RMS)
 *   - `extra.affiliateId`       = (optional) affiliate ID
 *
 * ── Coverage ────────────────────────────────────────────────────────────────
 *
 * Implemented (22):
 *   Products:     list, get, create, update, delete
 *   Orders:       list, get, cancel
 *   Customers:    list, get          (derived from orders — Rakuten has no customer API)
 *   Inventory:    list, get, set
 *   Fulfillments: list, get
 *   Collections:  list, get          (RMS CategoryAPI 2.0 shop categories)
 *   Discounts:    list, get          (RMS CouponAPI shop coupons)
 *
 * Omitted — registry returns HTTP 501:
 *   Variants, createOrder, updateOrder, createFulfillment, updateFulfillment,
 *   cancelFulfillment, createCustomer, updateCustomer, deleteCustomer,
 *   adjustInventoryLevel, and webhook methods.
 *
 * ── Resource coverage ──────────────────────────────────────────────────────
 * Unavailable: location — Rakuten manages logistics centrally; no seller location/warehouse endpoint exists in the RMS API
 * Unavailable: refund — Rakuten refunds are processed internally by Rakuten's payment system; no seller-facing refund API endpoint exists
 * Unavailable: transaction — No dedicated transaction/payment history endpoint; payment info is embedded in orders as settlementInfo only
 */

import type { Credentials, QueryParams } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { Order } from '../../schema/order'
import type { Customer } from '../../schema/customer'
import type { InventoryLevel } from '../../schema/inventory'
import type { Fulfillment } from '../../schema/fulfillment'
import type { Collection } from '../../schema/collection'
import type { Discount } from '../../schema/discount'

import { refreshCredentials as rakutenRefreshCredentials } from './auth'
import { RakutenClient } from './client'
import {
  DEFAULT_PAGE_SIZE,
  ITEM_LIST_PATH,
  ORDER_LIST_PATH,
  INVENTORY_LIST_PATH,
  CATEGORY_LIST_PATH,
  CATEGORY_SET_LIST_PATH,
  COUPON_GET_PATH,
  COUPON_SEARCH_PATH,
} from './constants'
import {
  transformProduct,
  untransformProduct,
  type RakutenItem,
} from './transform/product'
import { transformOrder, type RakutenOrder } from './transform/order'
import { transformCustomer, type RakutenCustomerSource } from './transform/customer'
import { transformInventoryLevel, type RakutenInventoryItem } from './transform/inventory'
import { transformFulfillments } from './transform/fulfillment'
import {
  transformCollection,
  type RakutenCategory,
  type RakutenCategorySet,
} from './transform/collection'
import { transformDiscount, type RakutenCoupon } from './transform/discount'

// ── Response envelope shapes ──────────────────────────────────────────────────

interface RmsItemListEnvelope {
  itemList?: RakutenItem[]
  paginationReturnMeta?: { totalCount?: number }
}

interface RmsItemEnvelope {
  item?: RakutenItem
}

interface RmsOrderListEnvelope {
  orderModelList?: RakutenOrder[]
  paginationReturnMeta?: { totalCount?: number }
}

interface RmsOrderEnvelope {
  orderModel?: RakutenOrder
}

interface RmsMutationEnvelope {
  status?: string
  errors?: Array<{ code?: string; message?: string }>
  item?: RakutenItem
}

interface RmsInventoryListEnvelope {
  inventoryList?: RakutenInventoryItem[]
  paginationReturnMeta?: { totalCount?: number }
}

interface RmsInventoryEnvelope {
  inventory?: RakutenInventoryItem
}

interface RmsCategoryListEnvelope {
  categories?: RakutenCategory[]
  paginationReturnMeta?: { totalCount?: number }
}

interface RmsCategoryEnvelope {
  category?: RakutenCategory
}

interface RmsCategorySetListEnvelope {
  categorySets?: RakutenCategorySet[]
}

interface RmsCouponSearchEnvelope {
  allCount?: number
  Content?: { coupons?: RakutenCoupon[] }
}

interface RmsCouponGetEnvelope {
  coupon?: RakutenCoupon
}

// ── Adapter ───────────────────────────────────────────────────────────────────
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class RakutenAdapter implements EcommerceAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'rakuten'
  readonly version = '0.1.0'

  // ── Auth ────────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    throw new Error(
      'Rakuten does not use OAuth. Configure credentials (licenseKey, serviceSecret) ' +
        'directly in the connection.',
    )
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error(
      'Rakuten does not use OAuth code exchange. Use static credentials instead.',
    )
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return rakutenRefreshCredentials(credentials)
  }

  verifyWebhook(_payload: Buffer, _headers: Record<string, string>, _secret: string): boolean {
    // Rakuten does not expose a standardised webhook HMAC verification
    return true
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private clientFor(credentials: Credentials): RakutenClient {
    return new RakutenClient(credentials)
  }

  // ── Products ────────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const client = this.clientFor(credentials)
    const offset = (params.page ?? 0) * (params.limit ?? DEFAULT_PAGE_SIZE)
    const res = await client.get<RmsItemListEnvelope>(ITEM_LIST_PATH, {
      offset,
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
    })
    return (res.itemList ?? []).map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const client = this.clientFor(credentials)
    const res = await client.get<RmsItemEnvelope>(`${ITEM_LIST_PATH}${encodeURIComponent(id)}`)
    if (!res.item) {
      throw new Error(`Rakuten getProduct: no item found for id '${id}'`)
    }
    return transformProduct(res.item)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const client = this.clientFor(credentials)
    const body = untransformProduct(data)
    const res = await client.post<RmsMutationEnvelope>(ITEM_LIST_PATH, body)
    if (res.errors && res.errors.length > 0) {
      const msg = res.errors.map((e) => `${e.code}: ${e.message}`).join(', ')
      throw new Error(`Rakuten createProduct failed: ${msg}`)
    }
    if (!res.item) {
      throw new Error('Rakuten createProduct: response did not include item data')
    }
    return transformProduct(res.item)
  }

  async updateProduct(credentials: Credentials, id: string, data: Partial<Product>): Promise<Product> {
    const client = this.clientFor(credentials)
    const body = untransformProduct(data)
    const res = await client.put<RmsMutationEnvelope>(
      `${ITEM_LIST_PATH}${encodeURIComponent(id)}`,
      body,
    )
    if (res.errors && res.errors.length > 0) {
      const msg = res.errors.map((e) => `${e.code}: ${e.message}`).join(', ')
      throw new Error(`Rakuten updateProduct failed: ${msg}`)
    }
    if (!res.item) {
      // Fall back to a fresh fetch if response doesn't echo the item
      return this.getProduct(credentials, id)
    }
    return transformProduct(res.item)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    const client = this.clientFor(credentials)
    const res = await client.delete<RmsMutationEnvelope>(
      `${ITEM_LIST_PATH}${encodeURIComponent(id)}`,
    )
    if (res.errors && res.errors.length > 0) {
      const msg = res.errors.map((e) => `${e.code}: ${e.message}`).join(', ')
      throw new Error(`Rakuten deleteProduct failed: ${msg}`)
    }
  }

  // ── Orders ──────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = this.clientFor(credentials)
    const offset = (params.page ?? 0) * (params.limit ?? DEFAULT_PAGE_SIZE)
    const res = await client.get<RmsOrderListEnvelope>(ORDER_LIST_PATH, {
      offset,
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
    })
    return (res.orderModelList ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = this.clientFor(credentials)
    const res = await client.get<RmsOrderEnvelope>(`${ORDER_LIST_PATH}${encodeURIComponent(id)}`)
    if (!res.orderModel) {
      throw new Error(`Rakuten getOrder: no order found for id '${id}'`)
    }
    return transformOrder(res.orderModel)
  }

  async cancelOrder(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Order> {
    const client = this.clientFor(credentials)
    const res = await client.post<RmsMutationEnvelope>(
      `${ORDER_LIST_PATH}${encodeURIComponent(id)}/cancel`,
    )
    if (res.errors && res.errors.length > 0) {
      const msg = res.errors.map((e) => `${e.code}: ${e.message}`).join(', ')
      throw new Error(`Rakuten cancelOrder failed: ${msg}`)
    }
    return this.getOrder(credentials, id)
  }

  // ── Customers ───────────────────────────────────────────────────────────────

  /**
   * Customers are derived from orders. Fetches recent orders and extracts
   * unique customers from their ordererInfo.
   */
  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const orders = await this.listOrders(credentials, params)
    const seen = new Set<string>()
    const customers: Customer[] = []

    for (const order of orders) {
      const raw = order.metadata as unknown as RakutenOrder
      const info = raw.ordererInfo as RakutenCustomerSource | undefined
      if (!info) continue

      const src: RakutenCustomerSource = {
        ...info,
        _id: info.ordererMailAddress
          ? `email:${info.ordererMailAddress}`
          : `name:${info.ordererName ?? 'unknown'}`,
        _orderNumbers: [order.id],
      }

      const customerId = src._id!
      if (seen.has(customerId)) continue
      seen.add(customerId)
      customers.push(transformCustomer(src))
    }

    return customers
  }

  /**
   * Get a customer by id. The id is derived as `email:<email>` or `name:<name>`
   * from orderer info. We search recent orders for a matching customer.
   */
  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const customers = await this.listCustomers(credentials, { limit: 100 } as QueryParams)
    const found = customers.find((c) => c.id === id)
    if (!found) {
      throw new Error(`Rakuten getCustomer: no customer found for id '${id}'`)
    }
    return found
  }

  // ── Inventory ────────────────────────────────────────────────────────────────

  async listInventoryLevels(credentials: Credentials, params: QueryParams): Promise<InventoryLevel[]> {
    const client = this.clientFor(credentials)
    const offset = (params.page ?? 0) * (params.limit ?? DEFAULT_PAGE_SIZE)
    const res = await client.get<RmsInventoryListEnvelope>(INVENTORY_LIST_PATH, {
      offset,
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
    })
    return (res.inventoryList ?? []).map(transformInventoryLevel)
  }

  async getInventoryLevel(credentials: Credentials, id: string): Promise<InventoryLevel> {
    const client = this.clientFor(credentials)
    // id format: `${itemUrl}:rakuten-default` — extract itemUrl
    const itemUrl = id.includes(':') ? id.split(':').slice(0, -1).join(':') : id
    const res = await client.get<RmsInventoryEnvelope>(
      `${INVENTORY_LIST_PATH}${encodeURIComponent(itemUrl)}`,
    )
    if (!res.inventory) {
      throw new Error(`Rakuten getInventoryLevel: no inventory found for id '${id}'`)
    }
    return transformInventoryLevel(res.inventory)
  }

  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    const client = this.clientFor(credentials)
    const res = await client.put<RmsInventoryEnvelope>(
      `${INVENTORY_LIST_PATH}${encodeURIComponent(data.variantId)}`,
      { normalInventoryStock: data.available },
    )
    if (!res.inventory) {
      // Re-fetch if not echoed in response
      return this.getInventoryLevel(credentials, `${data.variantId}:${data.locationId}`)
    }
    return transformInventoryLevel(res.inventory)
  }

  // ── Fulfillments ─────────────────────────────────────────────────────────────

  async listFulfillments(credentials: Credentials, params: QueryParams): Promise<Fulfillment[]> {
    const orderId = (params['orderId'] ?? params['order_id']) as string | undefined
    if (orderId) {
      // List fulfillments for a specific order
      const order = await this.getOrder(credentials, orderId)
      const raw = order.metadata as unknown as RakutenOrder
      return transformFulfillments(raw)
    }
    // List across recent orders
    const orders = await this.listOrders(credentials, params)
    const fulfillments: Fulfillment[] = []
    for (const order of orders) {
      const raw = order.metadata as unknown as RakutenOrder
      fulfillments.push(...transformFulfillments(raw))
    }
    return fulfillments
  }

  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    // id format: `${orderNumber}:${packageId}`
    const colonIdx = id.lastIndexOf(':')
    if (colonIdx === -1) {
      throw new Error(`Rakuten getFulfillment: invalid id format '${id}' — expected 'orderNumber:packageId'`)
    }
    const orderNumber = id.slice(0, colonIdx)
    const packageIdStr = id.slice(colonIdx + 1)

    const order = await this.getOrder(credentials, orderNumber)
    const raw = order.metadata as unknown as RakutenOrder
    const fulfillments = transformFulfillments(raw)

    const found = fulfillments.find((f) => f.id === id || f.id.endsWith(`:${packageIdStr}`))
    if (!found) {
      throw new Error(`Rakuten getFulfillment: no fulfillment '${id}' found on order '${orderNumber}'`)
    }
    return found
  }

  // ── Collections ──────────────────────────────────────────────────────────────

  /**
   * Lists all shop categories from the Rakuten RMS CategoryAPI 2.0.
   * Falls back to listing category sets when the categories endpoint is empty.
   */
  async listCollections(credentials: Credentials, params: QueryParams): Promise<Collection[]> {
    const client = this.clientFor(credentials)
    const offset = (params.page ?? 0) * (params.limit ?? DEFAULT_PAGE_SIZE)
    const res = await client.get<RmsCategoryListEnvelope>(CATEGORY_LIST_PATH, {
      offset,
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
    })
    const categories = res.categories ?? []
    if (categories.length > 0) {
      return categories.map(transformCollection)
    }
    // Fall back to category sets
    const setsRes = await client.get<RmsCategorySetListEnvelope>(CATEGORY_SET_LIST_PATH)
    return (setsRes.categorySets ?? []).map((cs) =>
      transformCollection({
        categoryId: cs.categorySetId,
        title: cs.title,
        created: cs.created,
        updated: cs.updated,
      }),
    )
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const client = this.clientFor(credentials)
    const res = await client.get<RmsCategoryEnvelope>(
      `${CATEGORY_LIST_PATH}${encodeURIComponent(id)}`,
    )
    if (!res.category) {
      throw new Error(`Rakuten getCollection: no category found for id '${id}'`)
    }
    return transformCollection(res.category)
  }

  // ── Discounts ────────────────────────────────────────────────────────────────

  async listDiscounts(credentials: Credentials, params: QueryParams): Promise<Discount[]> {
    const client = this.clientFor(credentials)
    const res = await client.get<RmsCouponSearchEnvelope>(COUPON_SEARCH_PATH, {
      hits: params.limit ?? DEFAULT_PAGE_SIZE,
      page: (params.page ?? 0) + 1,
    })
    return (res.Content?.coupons ?? []).map(transformDiscount)
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const client = this.clientFor(credentials)
    const res = await client.get<RmsCouponGetEnvelope>(COUPON_GET_PATH, {
      couponCode: id,
    })
    if (!res.coupon) {
      throw new Error(`Rakuten getDiscount: no coupon found for id '${id}'`)
    }
    return transformDiscount(res.coupon)
  }
}
