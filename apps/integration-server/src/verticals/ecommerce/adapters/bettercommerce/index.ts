/**
 * BetterCommerce adapter for the ecommerce vertical.
 *
 * Maps the BetterCommerce Commerce API v2 (`api20.bettercommerce.io/api/v2`)
 * to the canonical ecommerce resources. BetterCommerce uses OAuth 2.0
 * client-credentials — merchants supply a clientId (API Key) and
 * clientSecret (Shared Secret) from the dashboard; these exchange for a
 * 24-hour Bearer token. The adapter stores clientId/clientSecret in
 * `credentials.extra` so it can re-obtain a token when one expires.
 *
 * BetterCommerce does not publish a documented webhook signature verification
 * scheme, so verifyWebhook / parseWebhookEvents are not implemented.
 *
 * Supported resources:
 *  Products, Variants, Collections (categories), Locations (stores),
 *  Inventory (via product stock fields), Customers, Orders, Fulfillments
 *  (shipments), Refunds (returns), Transactions (payments), Discounts
 *  (promotions).
 *
 * Docs: https://docs.commerceapi.bettercommerce.io/
 */

import { oauth2ClientCredentials } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product, ProductVariant } from '../../schema/product'
import type { Collection } from '../../schema/collection'
import type { Location } from '../../schema/location'
import type { InventoryLevel } from '../../schema/inventory'
import type { Customer } from '../../schema/customer'
import type { Order } from '../../schema/order'
import type { Fulfillment } from '../../schema/fulfillment'
import type { Refund } from '../../schema/refund'
import type { Transaction } from '../../schema/transaction'
import type { Discount } from '../../schema/discount'

import { obtainToken } from './auth'
import { BetterCommerceClient } from './client'
import { AUTH_URL, TOKEN_PATH, DEFAULT_PAGE_SIZE } from './constants'

import {
  transformProduct,
  untransformProduct,
  transformVariant,
  untransformVariant,
  type RawBCProduct,
  type RawBCVariantProduct,
} from './transform/product'
import {
  transformCollection,
  untransformCollection,
  type RawBCCategory,
} from './transform/collection'
import { transformLocation, type RawBCStore } from './transform/location'
import {
  transformInventoryLevel,
  type RawBCInventoryItem,
} from './transform/inventory'
import {
  transformCustomer,
  untransformCustomer,
  type RawBCCustomer,
} from './transform/customer'
import {
  transformOrder,
  untransformOrder,
  type RawBCOrder,
} from './transform/order'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawBCShipment,
} from './transform/fulfillment'
import {
  transformRefund,
  untransformRefund,
  type RawBCRefund,
} from './transform/refund'
import {
  transformTransaction,
  untransformTransaction,
  type RawBCTransaction,
} from './transform/transaction'
import {
  transformDiscount,
  untransformDiscount,
  type RawBCPromotion,
} from './transform/discount'

// ── Credential form (Connect Link) ────────────────────────────────────────────

const CRED_FORM = oauth2ClientCredentials({
  tokenUrl: `${AUTH_URL}${TOKEN_PATH}`,
})

// ── Adapter config ────────────────────────────────────────────────────────────

export interface BetterCommerceAdapterConfig {
  /** API Key (clientId) from the BetterCommerce dashboard → Settings → API Token. */
  clientId?: string
  /** Shared Secret (clientSecret) from the same location. */
  clientSecret?: string
}

export class BettercommerceAdapter implements EcommerceAdapter {
  readonly platform = 'bettercommerce'
  readonly version = '0.1.0'
  /** Honours `params.search`; see AdapterCapabilities. Declared so the
   *  router can refuse the parameter on adapters that would drop it. */
  readonly capabilities = { search: true }

  // Connect Link support
  credentialFields = CRED_FORM.credentialFields
  exchangeCredentials = CRED_FORM.exchangeCredentials

  private configClientId: string | undefined
  private configClientSecret: string | undefined

  constructor(config: BetterCommerceAdapterConfig = {}) {
    this.configClientId = config.clientId
    this.configClientSecret = config.clientSecret
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  /**
   * BetterCommerce uses client-credentials — there is no authorize URL.
   * Return the documentation URL as an informational pointer.
   */
  getAuthUrl(_state: string): string {
    return 'https://docs.commerceapi.bettercommerce.io/'
  }

  /**
   * BetterCommerce does not use an authorization-code flow. Callers
   * should use the Connect Link form (`credentialFields` / `exchangeCredentials`)
   * to obtain credentials via the client-credentials grant.
   */
  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error(
      'BetterCommerce does not use an authorization-code flow. ' +
        'Supply clientId and clientSecret via the Connect Link credential form, ' +
        'or POST them to /v1/connections with credentials: { clientId, clientSecret }.',
    )
  }

  /**
   * Re-obtain a fresh token using the clientId/clientSecret stored in
   * `credentials.extra`. BetterCommerce tokens expire after 24 hours.
   */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    const clientId =
      (credentials.extra?.['clientId'] as string | undefined) ?? this.configClientId
    const clientSecret =
      (credentials.extra?.['clientSecret'] as string | undefined) ?? this.configClientSecret
    if (!clientId || !clientSecret) {
      // No refresh possible — return unchanged and let the next request fail.
      return credentials
    }
    return obtainToken(clientId, clientSecret)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private clientFor(credentials: Credentials): BetterCommerceClient {
    // Merge constructor-level config into credentials.extra so the client
    // has everything it needs for automatic token refresh.
    const clientId =
      (credentials.extra?.['clientId'] as string | undefined) ?? this.configClientId
    const clientSecret =
      (credentials.extra?.['clientSecret'] as string | undefined) ?? this.configClientSecret

    if (!clientId || !clientSecret) {
      throw new Error(
        'BetterCommerce adapter requires clientId and clientSecret. ' +
          'Configure them via the Connect Link form or in the adapter constructor config.',
      )
    }

    const merged: Credentials = {
      ...credentials,
      extra: { ...credentials.extra, clientId, clientSecret },
    }
    return new BetterCommerceClient(merged)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      pageSize: params.limit ?? DEFAULT_PAGE_SIZE,
    }
    const page = params['page'] ?? params['currentPage']
    if (page != null) out['currentPage'] = page
    if (params.updatedAfter) {
      out['updatedAfter'] = params.updatedAfter.toISOString()
    }
    if (params.search) out['freeText'] = params.search
    return out
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.clientFor(credentials).listPage<RawBCProduct>(
      'catalog/product',
      this.listParams(params),
    )
    return res.items.map((p) => transformProduct(p))
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const raw = await this.clientFor(credentials).getSingle<RawBCProduct>(
      `catalog/product/${id}`,
    )
    return transformProduct(raw)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const raw = await this.clientFor(credentials).postSingle<RawBCProduct>(
      'catalog/product',
      untransformProduct(data),
    )
    return transformProduct(raw)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const raw = await this.clientFor(credentials).putSingle<RawBCProduct>(
      `catalog/product/${id}`,
      untransformProduct(data),
    )
    return transformProduct(raw)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`catalog/product/${id}`)
  }

  // ── Variants ──────────────────────────────────────────────────────────────

  async listVariants(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<ProductVariant[]> {
    const productId = params['productId'] ?? params['product_id']
    if (!productId) {
      // Fallback: fetch products and flatten variantProducts.
      const res = await this.clientFor(credentials).listPage<RawBCProduct>(
        'catalog/product',
        this.listParams(params),
      )
      return res.items.flatMap((p) =>
        (p.variantProducts ?? []).map((v) => transformVariant(v, p.recordId ?? p.productId)),
      )
    }
    const pid = String(productId)
    const raw = await this.clientFor(credentials).getSingle<RawBCProduct>(
      `catalog/product/${pid}`,
    )
    return (raw.variantProducts ?? []).map((v) => transformVariant(v, pid))
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    // BetterCommerce variant IDs are standalone recordIds.
    const raw = await this.clientFor(credentials).getSingle<RawBCVariantProduct>(
      `catalog/product/variant/${id}`,
    )
    return transformVariant(raw)
  }

  async updateVariant(
    credentials: Credentials,
    id: string,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    const raw = await this.clientFor(credentials).putSingle<RawBCVariantProduct>(
      `catalog/product/variant/${id}`,
      untransformVariant(data),
    )
    return transformVariant(raw)
  }

  // ── Collections ───────────────────────────────────────────────────────────

  async listCollections(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Collection[]> {
    const res = await this.clientFor(credentials).listPage<RawBCCategory>(
      'catalog/category',
      this.listParams(params),
    )
    return res.items.map((c) => transformCollection(c))
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const raw = await this.clientFor(credentials).getSingle<RawBCCategory>(
      `catalog/category/${id}`,
    )
    return transformCollection(raw)
  }

  async createCollection(
    credentials: Credentials,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const raw = await this.clientFor(credentials).postSingle<RawBCCategory>(
      'catalog/category',
      untransformCollection(data),
    )
    return transformCollection(raw)
  }

  async updateCollection(
    credentials: Credentials,
    id: string,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const raw = await this.clientFor(credentials).putSingle<RawBCCategory>(
      `catalog/category/${id}`,
      untransformCollection(data),
    )
    return transformCollection(raw)
  }

  async deleteCollection(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`catalog/category/${id}`)
  }

  // ── Locations ─────────────────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const res = await this.clientFor(credentials).listPage<RawBCStore>(
      'stores',
      this.listParams(params),
    )
    return res.items.map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const raw = await this.clientFor(credentials).getSingle<RawBCStore>(`stores/${id}`)
    return transformLocation(raw)
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    // BetterCommerce embeds stock on products/variants. We query products and
    // map currentStock to inventory levels.
    const locationId = (params['locationId'] ?? params['location_id'] ?? 'default') as string
    const res = await this.clientFor(credentials).listPage<RawBCInventoryItem>(
      'catalog/product',
      this.listParams(params),
    )
    return res.items.map((item) => transformInventoryLevel(item, locationId))
  }

  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    const raw = await this.clientFor(credentials).putSingle<RawBCInventoryItem>(
      `catalog/product/variant/${data.variantId}`,
      { currentStock: data.available },
    )
    return transformInventoryLevel(raw, data.locationId)
  }

  async adjustInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; delta: number },
  ): Promise<InventoryLevel> {
    // Fetch current stock, then apply the delta.
    const current = await this.clientFor(credentials).getSingle<RawBCInventoryItem>(
      `catalog/product/variant/${data.variantId}`,
    )
    const newQty = (current.currentStock ?? 0) + data.delta
    const raw = await this.clientFor(credentials).putSingle<RawBCInventoryItem>(
      `catalog/product/variant/${data.variantId}`,
      { currentStock: newQty },
    )
    return transformInventoryLevel(raw, data.locationId)
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const res = await this.clientFor(credentials).listPage<RawBCCustomer>(
      'commerce/customer',
      this.listParams(params),
    )
    return res.items.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const raw = await this.clientFor(credentials).getSingle<RawBCCustomer>(
      `commerce/customer/${id}`,
    )
    return transformCustomer(raw)
  }

  async createCustomer(credentials: Credentials, data: Partial<Customer>): Promise<Customer> {
    const raw = await this.clientFor(credentials).postSingle<RawBCCustomer>(
      'commerce/customer/create',
      untransformCustomer(data),
    )
    return transformCustomer(raw)
  }

  async updateCustomer(
    credentials: Credentials,
    id: string,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const raw = await this.clientFor(credentials).putSingle<RawBCCustomer>(
      `commerce/customer/${id}`,
      untransformCustomer(data),
    )
    return transformCustomer(raw)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const res = await this.clientFor(credentials).listPage<RawBCOrder>(
      'commerce/order',
      this.listParams(params),
    )
    return res.items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const raw = await this.clientFor(credentials).getSingle<RawBCOrder>(
      `commerce/order/${id}`,
    )
    return transformOrder(raw)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const raw = await this.clientFor(credentials).postSingle<RawBCOrder>(
      'commerce/order',
      untransformOrder(data),
    )
    return transformOrder(raw)
  }

  async updateOrder(
    credentials: Credentials,
    id: string,
    data: Partial<Order>,
  ): Promise<Order> {
    const raw = await this.clientFor(credentials).putSingle<RawBCOrder>(
      `commerce/order/${id}`,
      untransformOrder(data),
    )
    return transformOrder(raw)
  }

  async cancelOrder(
    credentials: Credentials,
    id: string,
    data?: { reason?: string },
  ): Promise<Order> {
    const raw = await this.clientFor(credentials).putSingle<RawBCOrder>(
      `commerce/order/${id}/cancel`,
      { cancelReason: data?.reason },
    )
    return transformOrder(raw)
  }

  // ── Fulfillments ──────────────────────────────────────────────────────────

  async listFulfillments(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Fulfillment[]> {
    const orderId = params['order_id'] ?? params['orderId']
    if (!orderId) {
      throw new Error('listFulfillments requires `order_id` in query params')
    }
    const res = await this.clientFor(credentials).listPage<RawBCShipment>(
      `commerce/order/${String(orderId)}/shipment`,
      this.listParams(params),
    )
    return res.items.map(transformFulfillment)
  }

  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    const raw = await this.clientFor(credentials).getSingle<RawBCShipment>(
      `commerce/shipment/${id}`,
    )
    return transformFulfillment(raw)
  }

  async createFulfillment(
    credentials: Credentials,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    if (!data.orderId) throw new Error('createFulfillment requires orderId')
    const raw = await this.clientFor(credentials).postSingle<RawBCShipment>(
      `commerce/order/${data.orderId}/shipment`,
      untransformFulfillment(data),
    )
    return transformFulfillment(raw)
  }

  async updateFulfillment(
    credentials: Credentials,
    id: string,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    const raw = await this.clientFor(credentials).putSingle<RawBCShipment>(
      `commerce/shipment/${id}`,
      untransformFulfillment(data),
    )
    return transformFulfillment(raw)
  }

  // ── Refunds ───────────────────────────────────────────────────────────────

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const orderId = params['order_id'] ?? params['orderId']
    if (!orderId) {
      throw new Error('listRefunds requires `order_id` in query params')
    }
    const res = await this.clientFor(credentials).listPage<RawBCRefund>(
      `commerce/order/${String(orderId)}/return`,
      this.listParams(params),
    )
    return res.items.map((r) => transformRefund(r, String(orderId)))
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    // id may be in `orderId:returnId` composite format.
    const [orderId, returnId] = id.split(':')
    const path =
      orderId && returnId
        ? `commerce/order/${orderId}/return/${returnId}`
        : `commerce/return/${id}`
    const raw = await this.clientFor(credentials).getSingle<RawBCRefund>(path)
    return transformRefund(raw)
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.orderId) throw new Error('createRefund requires orderId')
    const raw = await this.clientFor(credentials).postSingle<RawBCRefund>(
      `commerce/order/${data.orderId}/return`,
      untransformRefund(data),
    )
    return transformRefund(raw, data.orderId)
  }

  // ── Transactions ──────────────────────────────────────────────────────────

  async listTransactions(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Transaction[]> {
    const orderId = params['order_id'] ?? params['orderId']
    if (!orderId) {
      throw new Error('listTransactions requires `order_id` in query params')
    }
    const res = await this.clientFor(credentials).listPage<RawBCTransaction>(
      `commerce/order/${String(orderId)}/payment`,
      this.listParams(params),
    )
    return res.items.map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const [orderId, txId] = id.split(':')
    const path =
      orderId && txId
        ? `commerce/order/${orderId}/payment/${txId}`
        : `commerce/payment/${id}`
    const raw = await this.clientFor(credentials).getSingle<RawBCTransaction>(path)
    return transformTransaction(raw)
  }

  async createTransaction(
    credentials: Credentials,
    data: Partial<Transaction>,
  ): Promise<Transaction> {
    if (!data.orderId) throw new Error('createTransaction requires orderId')
    const raw = await this.clientFor(credentials).postSingle<RawBCTransaction>(
      `commerce/order/${data.orderId}/payment`,
      untransformTransaction(data),
    )
    return transformTransaction(raw)
  }

  // ── Discounts ─────────────────────────────────────────────────────────────

  async listDiscounts(credentials: Credentials, params: QueryParams): Promise<Discount[]> {
    const res = await this.clientFor(credentials).listPage<RawBCPromotion>(
      'commerce/promotion',
      this.listParams(params),
    )
    return res.items.map(transformDiscount)
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const raw = await this.clientFor(credentials).getSingle<RawBCPromotion>(
      `commerce/promotion/${id}`,
    )
    return transformDiscount(raw)
  }

  async createDiscount(credentials: Credentials, data: Partial<Discount>): Promise<Discount> {
    const raw = await this.clientFor(credentials).postSingle<RawBCPromotion>(
      'commerce/promotion',
      untransformDiscount(data),
    )
    return transformDiscount(raw)
  }

  async updateDiscount(
    credentials: Credentials,
    id: string,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const raw = await this.clientFor(credentials).putSingle<RawBCPromotion>(
      `commerce/promotion/${id}`,
      untransformDiscount(data),
    )
    return transformDiscount(raw)
  }

  async deleteDiscount(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`commerce/promotion/${id}`)
  }
}
