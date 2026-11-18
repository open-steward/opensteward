import { CONNECT_FORM } from './connect-form'
/**
 * Magento / Adobe Commerce adapter for the ecommerce vertical.
 *
 * Maps the Magento REST API (`/rest/V1`) to the canonical ecommerce
 * resources. Notable Magento-isms vs. the other adapters:
 *
 *  - Auth uses admin integration tokens via
 *    `POST /V1/integration/admin/token`. There is no OAuth2 code-
 *    exchange flow; `refreshCredentials` re-mints a token from stored
 *    username/password. See `./auth.ts` for the full explanation.
 *  - Magento has no native webhooks in Community Edition, so the
 *    `verifyWebhook` and `parseWebhookEvents` methods are intentionally
 *    omitted. Adobe Commerce (enterprise) adds "webhooks" as a paid
 *    feature; support will arrive in a follow-up PR.
 *  - Magento has no public REST endpoint for payment transactions; the
 *    `listTransactions` / `getTransaction` / `createTransaction`
 *    methods are omitted.
 *  - Magento shipments are immutable once created; we implement
 *    list / get / create and omit update / cancel.
 *  - Orders can't be created over REST via a plain POST /V1/orders —
 *    real orders originate from the cart / checkout flow. The
 *    adapter's `createOrder` throws with a clear error documenting
 *    this; `updateOrder` is a best-effort status comment update.
 *  - Variants are Magento configurable-product children, addressed as
 *    a composite `parentSku:childSku` id.
 *  - Inventory is MSI source-items; `listInventoryLevels` requires
 *    a `sku` query param (child product SKU) because Magento has no
 *    unfiltered "list all source-items" endpoint in practice.
 */

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: transaction — Magento 2 / Adobe Commerce has no public REST endpoint for payment transactions; transaction data is internal to the payment gateway modules and is not exposed via the core /rest/V1 API.

import type { Credentials, QueryParams } from '@opensteward/shared'
import { pageLocally } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product, ProductVariant } from '../../schema/product'
import type { Collection } from '../../schema/collection'
import type { Location } from '../../schema/location'
import type { InventoryLevel } from '../../schema/inventory'
import type { Customer } from '../../schema/customer'
import type { Order } from '../../schema/order'
import type { Fulfillment } from '../../schema/fulfillment'
import type { Refund } from '../../schema/refund'
import type { Discount } from '../../schema/discount'

import {
  buildAuthUrl,
  exchangeCode as magentoExchangeCode,
  refreshCredentials as magentoRefreshCredentials,
} from './auth'
import { MagentoClient, type SearchCriteriaFilterGroup } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import {
  transformProduct,
  untransformProduct,
  transformProductVariant,
  untransformProductVariant,
  type RawMagentoProduct,
} from './transform/product'
import {
  transformCollection,
  untransformCollection,
  type RawMagentoCategory,
} from './transform/collection'
import {
  transformCustomer,
  untransformCustomer,
  type RawMagentoCustomer,
} from './transform/customer'
import { transformOrder, type RawMagentoOrder } from './transform/order'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawMagentoShipment,
} from './transform/fulfillment'
import {
  transformRefund,
  untransformRefund,
  type RawMagentoCreditMemo,
} from './transform/refund'
import {
  transformDiscount,
  untransformDiscount,
  type RawMagentoSalesRule,
  type RawMagentoCoupon,
} from './transform/discount'
import {
  transformInventoryLevel,
  type RawMagentoSourceItem,
} from './transform/inventory'
import {
  transformLocation,
  type RawMagentoSource,
} from './transform/location'

export interface MagentoAdapterConfig {
  /** Base URL of the Magento store, e.g. `https://mystore.example` (no trailing slash). */
  baseUrl?: string
  /** Admin username used to mint integration tokens. */
  adminUsername?: string
  /** Admin password used to mint integration tokens. */
  adminPassword?: string
}

// ── Helper shapes for Magento flat category tree ────────────────────────────

interface MagentoCategoryNode extends RawMagentoCategory {
  children_data?: MagentoCategoryNode[]
}

function flattenCategories(root: MagentoCategoryNode): RawMagentoCategory[] {
  const out: RawMagentoCategory[] = []
  const walk = (node: MagentoCategoryNode) => {
    out.push(node)
    for (const child of node.children_data ?? []) walk(child)
  }
  walk(root)
  return out
}


export class MagentoAdapter implements EcommerceAdapter {

  // Connect Link support — see ./connect-form.ts for the fields collected.

  credentialFields = CONNECT_FORM.credentialFields

  exchangeCredentials = CONNECT_FORM.exchangeCredentials

  readonly platform = 'magento'
  readonly version = '0.1.0'

  private configBaseUrl: string | undefined
  private configUsername: string | undefined
  private configPassword: string | undefined

  constructor(config: MagentoAdapterConfig = {}) {
    this.configBaseUrl = config.baseUrl
    this.configUsername = config.adminUsername
    this.configPassword = config.adminPassword
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    // Informational — the Magento admin "Create Integration" page. The
    // `state` param is intentionally ignored because Magento does not
    // run a real OAuth2 authorize flow for REST access.
    return buildAuthUrl(this.configBaseUrl ?? 'https://your-magento-site.example')
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    return magentoExchangeCode()
  }

  /**
   * Refresh the admin integration token by re-calling the token
   * endpoint with the stored username/password. The plaintext
   * credentials live in `credentials.extra` (encrypted at rest by
   * `CredentialStore`) and must remain there for the token to be
   * refreshable.
   */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return magentoRefreshCredentials(credentials)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /**
   * Merge constructor config with per-request credentials, validate
   * that all required fields are present, and return a ready-to-use
   * `MagentoClient`. Per-request credentials take precedence over
   * constructor config — mirrors the WooCommerce adapter pattern.
   */
  private clientFor(credentials: Credentials): MagentoClient {
    const baseUrl =
      (credentials.extra?.['baseUrl'] as string | undefined) ?? this.configBaseUrl
    const adminUsername =
      (credentials.extra?.['adminUsername'] as string | undefined) ?? this.configUsername
    const adminPassword =
      (credentials.extra?.['adminPassword'] as string | undefined) ?? this.configPassword

    if (!baseUrl) {
      throw new Error(
        'Magento adapter is missing baseUrl — either configure it in ' +
          'apps/integration-server/config/config.yml under adapters.magento, or POST it ' +
          'to /v1/connections with credentials: {baseUrl, adminUsername, adminPassword}.',
      )
    }
    if (!credentials.accessToken && (!adminUsername || !adminPassword)) {
      throw new Error(
        'Magento adapter needs either an accessToken or (adminUsername + adminPassword) ' +
          'to mint one. Re-create the connection with the required fields.',
      )
    }

    const mergedCreds: Credentials = {
      ...credentials,
      accessToken: credentials.accessToken || 'pending',
      extra: {
        ...credentials.extra,
        baseUrl,
        ...(adminUsername ? { adminUsername } : {}),
        ...(adminPassword ? { adminPassword } : {}),
      },
    }
    return new MagentoClient(mergedCreds)
  }

  private pageParams(params: QueryParams): { currentPage: number; pageSize: number } {
    return {
      currentPage: params.page ?? 1,
      pageSize: params.limit ?? DEFAULT_PAGE_SIZE,
    }
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const { currentPage, pageSize } = this.pageParams(params)
    const res = await this.clientFor(credentials).listWithSearchCriteria<RawMagentoProduct>(
      'products',
      { currentPage, pageSize },
    )
    return res.items.map((p) => transformProduct(p))
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const client = this.clientFor(credentials)
    const raw = await client.get<RawMagentoProduct>(
      `products/${encodeURIComponent(id)}`,
    )
    let children: RawMagentoProduct[] | undefined
    if (raw.type_id === 'configurable') {
      try {
        children = await client.get<RawMagentoProduct[]>(
          `configurable-products/${encodeURIComponent(id)}/children`,
        )
      } catch {
        children = undefined
      }
    }
    return transformProduct(raw, children)
  }

  async createProduct(
    credentials: Credentials,
    data: Partial<Product>,
  ): Promise<Product> {
    const res = await this.clientFor(credentials).post<RawMagentoProduct>(
      'products',
      untransformProduct(data),
    )
    return transformProduct(res)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const res = await this.clientFor(credentials).put<RawMagentoProduct>(
      `products/${encodeURIComponent(id)}`,
      untransformProduct(data),
    )
    return transformProduct(res)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`products/${encodeURIComponent(id)}`)
  }

  // ── Variants ──────────────────────────────────────────────────────────────

  async listVariants(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<ProductVariant[]> {
    const productId = (params['productId'] ?? params['product_id']) as
      | string
      | undefined
    if (!productId) {
      throw new Error(
        'Magento requires ?productId= for listVariants; variants are children of a ' +
          'configurable parent product.',
      )
    }
    const client = this.clientFor(credentials)
    const [parent, children] = await Promise.all([
      client.get<RawMagentoProduct>(`products/${encodeURIComponent(productId)}`),
      client.get<RawMagentoProduct[]>(
        `configurable-products/${encodeURIComponent(productId)}/children`,
      ),
    ])
    return children.map((c) => transformProductVariant(c, productId, parent))
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    const [parentSku, childSku] = id.split(':')
    if (!parentSku || !childSku) {
      throw new Error('Invalid variant id format: expected `parentSku:childSku`')
    }
    const client = this.clientFor(credentials)
    const [parent, child] = await Promise.all([
      client.get<RawMagentoProduct>(`products/${encodeURIComponent(parentSku)}`),
      client.get<RawMagentoProduct>(`products/${encodeURIComponent(childSku)}`),
    ])
    return transformProductVariant(child, parentSku, parent)
  }

  async createVariant(
    credentials: Credentials,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    const parentSku = data.productId
    const childSku = data.sku
    if (!parentSku || !childSku) {
      throw new Error('Magento createVariant requires productId (parent SKU) + sku')
    }
    const client = this.clientFor(credentials)
    await client.post(
      `configurable-products/${encodeURIComponent(parentSku)}/child`,
      { childSku },
    )
    const child = await client.get<RawMagentoProduct>(
      `products/${encodeURIComponent(childSku)}`,
    )
    const parent = await client.get<RawMagentoProduct>(
      `products/${encodeURIComponent(parentSku)}`,
    )
    return transformProductVariant(child, parentSku, parent)
  }

  async updateVariant(
    credentials: Credentials,
    id: string,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    const [parentSku, childSku] = id.split(':')
    if (!parentSku || !childSku) {
      throw new Error('Invalid variant id format: expected `parentSku:childSku`')
    }
    const client = this.clientFor(credentials)
    const updated = await client.put<RawMagentoProduct>(
      `products/${encodeURIComponent(childSku)}`,
      untransformProductVariant(data),
    )
    const parent = await client.get<RawMagentoProduct>(
      `products/${encodeURIComponent(parentSku)}`,
    )
    return transformProductVariant(updated, parentSku, parent)
  }

  async deleteVariant(credentials: Credentials, id: string): Promise<void> {
    const [parentSku, childSku] = id.split(':')
    if (!parentSku || !childSku) {
      throw new Error('Invalid variant id format: expected `parentSku:childSku`')
    }
    await this.clientFor(credentials).delete(
      `configurable-products/${encodeURIComponent(parentSku)}/children/${encodeURIComponent(childSku)}`,
    )
  }

  // ── Collections ───────────────────────────────────────────────────────────

  async listCollections(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Collection[]> {
    // /V1/categories returns a tree root, not a flat list — walk it.
    // GetV1Categories documents only rootCategoryId and depth: no page or
    // size parameter, and the tree is the whole collection, so page locally.
    const root = await this.clientFor(credentials).get<MagentoCategoryNode>('categories')
    return pageLocally(flattenCategories(root).map((c) => transformCollection(c)), params)
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const res = await this.clientFor(credentials).get<RawMagentoCategory>(
      `categories/${encodeURIComponent(id)}`,
    )
    return transformCollection(res)
  }

  async createCollection(
    credentials: Credentials,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const res = await this.clientFor(credentials).post<RawMagentoCategory>(
      'categories',
      untransformCollection(data),
    )
    return transformCollection(res)
  }

  async updateCollection(
    credentials: Credentials,
    id: string,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const res = await this.clientFor(credentials).put<RawMagentoCategory>(
      `categories/${encodeURIComponent(id)}`,
      untransformCollection(data),
    )
    return transformCollection(res)
  }

  async deleteCollection(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`categories/${encodeURIComponent(id)}`)
  }

  // ── Locations ─────────────────────────────────────────────────────────────

  async listLocations(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Location[]> {
    const { currentPage, pageSize } = this.pageParams(params)
    const res = await this.clientFor(credentials).listWithSearchCriteria<RawMagentoSource>(
      'inventory/sources',
      { currentPage, pageSize },
    )
    return res.items.map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const res = await this.clientFor(credentials).get<RawMagentoSource>(
      `inventory/sources/${encodeURIComponent(id)}`,
    )
    return transformLocation(res)
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    // Magento's /V1/inventory/source-items requires a filter; list by
    // sku when provided, otherwise by source_code.
    const sku = params['sku'] as string | undefined
    const sourceCode = (params['source_code'] ?? params['locationId']) as string | undefined
    if (!sku && !sourceCode) {
      throw new Error(
        'Magento listInventoryLevels requires `sku` or `source_code` in query params — ' +
          'the source-items endpoint does not support an unfiltered list.',
      )
    }
    const filterGroups: SearchCriteriaFilterGroup[] = []
    if (sku) filterGroups.push({ filters: [{ field: 'sku', value: sku }] })
    if (sourceCode) {
      filterGroups.push({ filters: [{ field: 'source_code', value: sourceCode }] })
    }
    const { currentPage, pageSize } = this.pageParams(params)
    const res = await this.clientFor(credentials).listWithSearchCriteria<RawMagentoSourceItem>(
      'inventory/source-items',
      { currentPage, pageSize, filterGroups },
    )
    return res.items.map(transformInventoryLevel)
  }

  async getInventoryLevel(
    credentials: Credentials,
    id: string,
  ): Promise<InventoryLevel> {
    const [sku, sourceCode] = id.split(':')
    if (!sku || !sourceCode) {
      throw new Error('Invalid inventory id format: expected `sku:source_code`')
    }
    const client = this.clientFor(credentials)
    const res = await client.listWithSearchCriteria<RawMagentoSourceItem>(
      'inventory/source-items',
      {
        filterGroups: [
          { filters: [{ field: 'sku', value: sku }] },
          { filters: [{ field: 'source_code', value: sourceCode }] },
        ],
      },
    )
    const hit = res.items[0]
    if (!hit) {
      throw new Error(`Magento source-item not found for ${sku} @ ${sourceCode}`)
    }
    return transformInventoryLevel(hit)
  }

  async adjustInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; delta: number },
  ): Promise<InventoryLevel> {
    const current = await this.getInventoryLevel(
      credentials,
      `${data.variantId}:${data.locationId}`,
    )
    return this.setInventoryLevel(credentials, {
      variantId: data.variantId,
      locationId: data.locationId,
      available: current.available + data.delta,
    })
  }

  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    const client = this.clientFor(credentials)
    await client.post('inventory/source-items', {
      sourceItems: [
        {
          sku: data.variantId,
          source_code: data.locationId,
          quantity: data.available,
          status: data.available > 0 ? 1 : 0,
        },
      ],
    })
    return {
      id: `${data.variantId}:${data.locationId}`,
      variantId: data.variantId,
      locationId: data.locationId,
      available: data.available,
      metadata: {
        sku: data.variantId,
        source_code: data.locationId,
        quantity: data.available,
      },
    }
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  async listCustomers(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Customer[]> {
    const { currentPage, pageSize } = this.pageParams(params)
    const res = await this.clientFor(credentials).listWithSearchCriteria<RawMagentoCustomer>(
      'customers/search',
      { currentPage, pageSize },
    )
    return res.items.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const res = await this.clientFor(credentials).get<RawMagentoCustomer>(
      `customers/${encodeURIComponent(id)}`,
    )
    return transformCustomer(res)
  }

  async createCustomer(
    credentials: Credentials,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const res = await this.clientFor(credentials).post<RawMagentoCustomer>(
      'customers',
      untransformCustomer(data),
    )
    return transformCustomer(res)
  }

  async updateCustomer(
    credentials: Credentials,
    id: string,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const res = await this.clientFor(credentials).put<RawMagentoCustomer>(
      `customers/${encodeURIComponent(id)}`,
      untransformCustomer(data),
    )
    return transformCustomer(res)
  }

  async deleteCustomer(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`customers/${encodeURIComponent(id)}`)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const { currentPage, pageSize } = this.pageParams(params)
    const res = await this.clientFor(credentials).listWithSearchCriteria<RawMagentoOrder>(
      'orders',
      { currentPage, pageSize },
    )
    return res.items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const res = await this.clientFor(credentials).get<RawMagentoOrder>(
      `orders/${encodeURIComponent(id)}`,
    )
    return transformOrder(res)
  }

  async createOrder(
    _credentials: Credentials,
    _data: Partial<Order>,
  ): Promise<Order> {
    throw new Error(
      'Magento orders must originate from the storefront cart flow; direct order creation ' +
        'is not supported in this adapter. Use the cart + checkout APIs or the admin UI.',
    )
  }

  async updateOrder(
    credentials: Credentials,
    id: string,
    data: Partial<Order>,
  ): Promise<Order> {
    // Magento's full `POST /V1/orders` "create" is effectively a
    // nested-entity sync that most stores forbid over REST, so updateOrder
    // is restricted to status-comment updates via
    // `POST /V1/orders/{id}/comments` and returns the refreshed order.
    const client = this.clientFor(credentials)
    const statusHistory = {
      statusHistory: {
        comment: data.note ?? 'Updated via OpenSteward',
        is_customer_notified: 0,
        is_visible_on_front: 0,
        status: data.financialStatus ?? undefined,
      },
    }
    await client.post(`orders/${encodeURIComponent(id)}/comments`, statusHistory)
    const refreshed = await client.get<RawMagentoOrder>(
      `orders/${encodeURIComponent(id)}`,
    )
    return transformOrder(refreshed)
  }

  async cancelOrder(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Order> {
    const client = this.clientFor(credentials)
    await client.post(`orders/${encodeURIComponent(id)}/cancel`)
    const refreshed = await client.get<RawMagentoOrder>(
      `orders/${encodeURIComponent(id)}`,
    )
    return transformOrder(refreshed)
  }

  // ── Fulfillments ──────────────────────────────────────────────────────────

  async listFulfillments(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Fulfillment[]> {
    const { currentPage, pageSize } = this.pageParams(params)
    const res = await this.clientFor(credentials).listWithSearchCriteria<RawMagentoShipment>(
      'shipments',
      { currentPage, pageSize },
    )
    return res.items.map(transformFulfillment)
  }

  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    const res = await this.clientFor(credentials).get<RawMagentoShipment>(
      `shipments/${encodeURIComponent(id)}`,
    )
    return transformFulfillment(res)
  }

  async createFulfillment(
    credentials: Credentials,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    if (!data.orderId) {
      throw new Error('Magento createFulfillment requires orderId')
    }
    const client = this.clientFor(credentials)
    const shipmentId = await client.post<number | string>(
      `order/${encodeURIComponent(data.orderId)}/ship`,
      untransformFulfillment(data),
    )
    const raw = await client.get<RawMagentoShipment>(
      `shipments/${encodeURIComponent(String(shipmentId))}`,
    )
    return transformFulfillment(raw)
  }

  // updateFulfillment / cancelFulfillment intentionally omitted —
  // Magento shipments are immutable once created.

  // ── Refunds ───────────────────────────────────────────────────────────────

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const { currentPage, pageSize } = this.pageParams(params)
    const res = await this.clientFor(credentials).listWithSearchCriteria<RawMagentoCreditMemo>(
      'creditmemos',
      { currentPage, pageSize },
    )
    return res.items.map(transformRefund)
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const res = await this.clientFor(credentials).get<RawMagentoCreditMemo>(
      `creditmemos/${encodeURIComponent(id)}`,
    )
    return transformRefund(res)
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.orderId) throw new Error('createRefund requires orderId')
    const client = this.clientFor(credentials)
    const memoId = await client.post<number | string>(
      `order/${encodeURIComponent(data.orderId)}/refund`,
      untransformRefund(data),
    )
    const raw = await client.get<RawMagentoCreditMemo>(
      `creditmemos/${encodeURIComponent(String(memoId))}`,
    )
    return transformRefund(raw)
  }

  // ── Discounts ─────────────────────────────────────────────────────────────

  async listDiscounts(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Discount[]> {
    const { currentPage, pageSize } = this.pageParams(params)
    const client = this.clientFor(credentials)
    const res = await client.listWithSearchCriteria<RawMagentoSalesRule>('salesRules/search', {
      currentPage,
      pageSize,
    })
    // For each rule, best-effort fetch the first coupon. Magento does
    // not inline coupons on rules; we query `/V1/coupons/search`
    // filtered by `rule_id`. Failures fall back to undefined rather
    // than abort the entire list.
    const out: Discount[] = []
    for (const rule of res.items) {
      let coupon: RawMagentoCoupon | undefined
      try {
        const couponRes = await client.listWithSearchCriteria<RawMagentoCoupon>(
          'coupons/search',
          {
            pageSize: 1,
            filterGroups: [
              { filters: [{ field: 'rule_id', value: rule.rule_id }] },
            ],
          },
        )
        coupon = couponRes.items[0]
      } catch {
        coupon = undefined
      }
      out.push(transformDiscount(rule, coupon))
    }
    return out
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const client = this.clientFor(credentials)
    const rule = await client.get<RawMagentoSalesRule>(
      `salesRules/${encodeURIComponent(id)}`,
    )
    let coupon: RawMagentoCoupon | undefined
    try {
      const couponRes = await client.listWithSearchCriteria<RawMagentoCoupon>(
        'coupons/search',
        {
          pageSize: 1,
          filterGroups: [{ filters: [{ field: 'rule_id', value: rule.rule_id }] }],
        },
      )
      coupon = couponRes.items[0]
    } catch {
      coupon = undefined
    }
    return transformDiscount(rule, coupon)
  }

  async createDiscount(
    credentials: Credentials,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const client = this.clientFor(credentials)
    const { rule, coupon } = untransformDiscount(data)
    const createdRule = await client.post<RawMagentoSalesRule>('salesRules', { rule })
    let createdCoupon: RawMagentoCoupon | undefined
    if (coupon) {
      createdCoupon = await client.post<RawMagentoCoupon>('coupons', {
        coupon: { ...coupon, rule_id: createdRule.rule_id },
      })
    }
    return transformDiscount(createdRule, createdCoupon)
  }

  async updateDiscount(
    credentials: Credentials,
    id: string,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const client = this.clientFor(credentials)
    const { rule, coupon } = untransformDiscount(data)
    const updatedRule = await client.put<RawMagentoSalesRule>(
      `salesRules/${encodeURIComponent(id)}`,
      { rule },
    )
    let updatedCoupon: RawMagentoCoupon | undefined
    if (coupon) {
      // Best-effort: look up the existing coupon for this rule, then
      // PUT an update.
      try {
        const couponRes = await client.listWithSearchCriteria<RawMagentoCoupon>(
          'coupons/search',
          {
            pageSize: 1,
            filterGroups: [{ filters: [{ field: 'rule_id', value: updatedRule.rule_id }] }],
          },
        )
        const existing = couponRes.items[0]
        if (existing?.coupon_id != null) {
          updatedCoupon = await client.put<RawMagentoCoupon>(
            `coupons/${existing.coupon_id}`,
            { coupon: { ...coupon, rule_id: updatedRule.rule_id } },
          )
        }
      } catch {
        updatedCoupon = undefined
      }
    }
    return transformDiscount(updatedRule, updatedCoupon)
  }

  async deleteDiscount(credentials: Credentials, id: string): Promise<void> {
    const client = this.clientFor(credentials)
    // Delete associated coupons first (best effort), then the rule.
    try {
      const couponRes = await client.listWithSearchCriteria<RawMagentoCoupon>(
        'coupons/search',
        {
          pageSize: 50,
          filterGroups: [{ filters: [{ field: 'rule_id', value: Number(id) } ] }],
        },
      )
      for (const c of couponRes.items) {
        if (c.coupon_id != null) {
          await client.delete(`coupons/${c.coupon_id}`)
        }
      }
    } catch {
      // ignore
    }
    await client.delete(`salesRules/${encodeURIComponent(id)}`)
  }
}
