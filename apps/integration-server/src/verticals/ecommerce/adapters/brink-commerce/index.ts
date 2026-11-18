/**
 * Brink Commerce adapter for the ecommerce vertical.
 *
 * Brink Commerce is a headless API-first ecommerce platform with separate
 * services for product management, order management, stock, pricing, and
 * discounts. Each service is a path prefix on the merchant's one host:
 *   https://management.{region}.{account}.brinkcommerce.io/{service}
 * (see constants.ts for the documented server URL).
 *
 * Auth: OAuth 2.0 client-credentials grant. Tokens expire after 1 hour and
 * are refreshed by `refreshCredentials`. Every API request also requires an
 * `x-api-key` header (static, from Merchant Portal).
 *
 * Reads (Brink documents no page, size, offset or cursor parameter anywhere):
 *   ✓ getProduct, getOrder, getFulfillment, getRefund, getDiscount (by id/code)
 *   ✓ listOrders by `email` or `merchantRef`, listFulfillments / listRefunds by
 *     `orderId`, listInventoryLevels by `variantId`: each documented route
 *     returns its whole set in one response, sliced locally (pageLocally)
 *   ✗ Refused with 501 NOT_SUPPORTED before any request: listProducts,
 *     listDiscounts (no collection GET is documented), listVariants and
 *     getVariant (a variant carries no price), and every list above when
 *     called without its filter (the unified router passes none).
 *
 * Not supported (no equivalent resource in Brink Commerce):
 *   ✗ Collections (Brink has no catalog grouping/collection concept)
 *   ✗ Customers (Brink has no customer entity in the Management/Order APIs)
 *   ✗ Transactions (payment is delegated to external payment providers)
 *   ✗ Locations (Brink's inventory concept uses warehouse IDs, not a Location API)
 *
 * Docs: https://docs.brinkcommerce.com/
 */

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: collection   — Brink Commerce has no catalog grouping or collection concept in its API
// Unavailable: customer     — Brink Commerce has no customer entity; shopper sessions are anonymous
// Unavailable: location     — Brink Commerce uses warehouse IDs for inventory but exposes no Location API endpoint
// Unavailable: transaction  — Payment processing is fully delegated to external providers (Klarna, Adyen, etc.); no transaction endpoint exists

import {
  type Credentials,
  type QueryParams,
  type CredentialField,
  pageLocally,
  readUpstreamPage,
  reportUpstreamPage,
} from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product, ProductVariant } from '../../schema/product'
import type { InventoryLevel } from '../../schema/inventory'
import type { Order } from '../../schema/order'
import type { Fulfillment } from '../../schema/fulfillment'
import type { Refund } from '../../schema/refund'
import type { Discount } from '../../schema/discount'

import { fetchAccessToken, refreshAccessToken } from './auth'
import { BrinkCommerceClient } from './client'
import { DEFAULT_SCOPES, managementBaseUrl } from './constants'
import {
  transformProduct,
  transformProductVariant,
  untransformProduct,
  untransformProductVariant,
  type RawBrinkProductParent,
  type RawBrinkProductVariant,
} from './transform/product'
import {
  transformOrder,
  transformOrderSummary,
  type RawBrinkOrder,
  type RawBrinkOrderSummary,
} from './transform/order'
import {
  transformDelivery,
  untransformDelivery,
  type RawBrinkDelivery,
} from './transform/fulfillment'
import { transformRefund, untransformRefund, type RawBrinkRefund } from './transform/refund'
import {
  transformInventoryLevel,
  transformVariantStock,
  type RawBrinkInventory,
  type RawBrinkVariantStock,
} from './transform/inventory'
import {
  transformDiscount,
  transformDiscountCode,
  type RawBrinkDiscountCodeResponse,
  untransformDiscountCode,
  untransformDiscountRule,
  type RawBrinkDiscountCode,
  type RawBrinkDiscountRule,
} from './transform/discount'

/**
 * "Max 100 orders are returned" — the description of both order-filter routes,
 * GET /orders/email/{email} and GET /orders/merchant-ref1/{merchantRef1}
 * (https://docs.brinkcommerce.com/technical/api-references/order/orders.md).
 * A cap on the answer, not a page size: nothing documents a way past it.
 */
const ORDER_FILTER_CAP = 100

/** Why variants are refused (product-variants.md, ProductVariant model). */
const VARIANT_NO_PRICE =
  'a Brink product variant carries no price (the documented ProductVariant fields are ' +
  'id, productParentId, name, displayNames, description, displayDescriptions, imageUrl, ' +
  'isActive, isArchived, tags, taxGroupId, taxCode, weight, dimensions, ' +
  'shippingAttributes, customAttributes, priceUnitType, created, updated), and a ' +
  'canonical variant requires one. Prices live on the Price service per store group and market.'

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

/** A string filter a direct caller put on params, or undefined. */
function stringParam(params: QueryParams, ...names: string[]): string | undefined {
  for (const name of names) {
    const v = params[name]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return undefined
}

export interface BrinkCommerceAdapterConfig {
  /** Merchant region, e.g. `eu-west-1`. */
  region: string
  /** Merchant account name (subdomain segment), e.g. `mycompany`. */
  account: string
  /** OAuth client ID from Merchant Portal → Settings → API Clients. */
  clientId?: string
  /** OAuth client secret from Merchant Portal → Settings → API Clients. */
  clientSecret?: string
  /** Static API key from Merchant Portal → Settings → API Clients. */
  apiKey?: string
  /** OAuth scopes to request. Defaults to DEFAULT_SCOPES. */
  scopes?: string[]
}

// Connect Link: credential fields for the UI form (clientId + clientSecret +
// the Brink-specific extras: apiKey, region, account).
const ADDITIONAL_FIELDS: CredentialField[] = [
  {
    name: 'apiKey',
    label: 'API key',
    type: 'password',
    required: true,
    helpText: 'Found in Merchant Portal → Settings → API Clients.',
  },
  {
    name: 'region',
    label: 'Region',
    type: 'text',
    placeholder: 'eu-west-1',
    required: true,
  },
  {
    name: 'account',
    label: 'Account name',
    type: 'text',
    placeholder: 'mycompany',
    required: true,
  },
]

// Credential fields for the Connect Link form (clientId + clientSecret + extras).
const CREDENTIAL_FIELDS: CredentialField[] = [
  { name: 'clientId', label: 'Client ID', type: 'text', required: true },
  { name: 'clientSecret', label: 'Client secret', type: 'password', required: true },
  ...ADDITIONAL_FIELDS,
]

export class BrinkCommerceAdapter implements EcommerceAdapter {
  readonly platform = 'brink-commerce'
  readonly version = '0.1.0'

  // Connect Link support
  credentialFields(): CredentialField[] {
    return CREDENTIAL_FIELDS
  }

  async exchangeCredentials(input: Record<string, string>): Promise<Credentials> {
    const clientId = (input['clientId'] ?? '').trim()
    const clientSecret = input['clientSecret'] ?? ''
    const region = (input['region'] ?? '').trim()
    const account = (input['account'] ?? '').trim()
    const apiKey = (input['apiKey'] ?? '').trim()
    if (!clientId || !clientSecret) throw new Error('Client ID and client secret are required.')
    if (!region) throw new Error('Region is required.')
    if (!account) throw new Error('Account name is required.')
    if (!apiKey) throw new Error('API key is required.')
    return fetchAccessToken(clientId, clientSecret, region, account, apiKey, this.scopes)
  }

  private region: string
  private account: string
  private configClientId: string | undefined
  private configClientSecret: string | undefined
  private configApiKey: string | undefined
  private scopes: string[]

  constructor(config: BrinkCommerceAdapterConfig) {
    this.region = config.region
    this.account = config.account
    this.configClientId = config.clientId
    this.configClientSecret = config.clientSecret
    this.configApiKey = config.apiKey
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  /**
   * Brink Commerce uses client-credentials grant. There is no user-facing
   * authorize URL; credentials are obtained from the Merchant Portal.
   */
  getAuthUrl(_state: string): string {
    return `https://portal.brinkcommerce.com/settings`
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error(
      'Brink Commerce does not use OAuth authorization-code flow. ' +
        'Use the Connect Link form to supply clientId, clientSecret, apiKey, region, and account.',
    )
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshAccessToken(credentials)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private resolveCredentials(credentials: Credentials): Credentials {
    const extra = credentials.extra ?? {}
    const region = (extra['region'] as string | undefined) ?? this.region
    const account = (extra['account'] as string | undefined) ?? this.account
    const apiKey = (extra['apiKey'] as string | undefined) ?? this.configApiKey
    const clientId = (extra['clientId'] as string | undefined) ?? this.configClientId
    const clientSecret = (extra['clientSecret'] as string | undefined) ?? this.configClientSecret

    if (!apiKey) {
      throw new Error(
        'Brink Commerce adapter: apiKey is required (Merchant Portal → Settings → API Clients)',
      )
    }
    return {
      ...credentials,
      extra: { ...extra, region, account, apiKey, clientId, clientSecret },
    }
  }

  private client(credentials: Credentials): BrinkCommerceClient {
    return new BrinkCommerceClient(this.resolveCredentials(credentials))
  }

  private baseUrl(service: string, credentials: Credentials): string {
    const extra = credentials.extra ?? {}
    const region = (extra['region'] as string | undefined) ?? this.region
    const account = (extra['account'] as string | undefined) ?? this.account
    return managementBaseUrl(service, region, account)
  }

  private productBaseUrl(credentials: Credentials): string {
    return this.baseUrl('product', credentials)
  }

  private stockBaseUrl(credentials: Credentials): string {
    return this.baseUrl('stock', credentials)
  }

  private discountBaseUrl(credentials: Credentials): string {
    return this.baseUrl('discount', credentials)
  }

  private orderBaseUrl(credentials: Credentials): string {
    return this.baseUrl('order', credentials)
  }

  // ── Products ──────────────────────────────────────────────────────────────

  /**
   * Refused. The Product Management API documents only
   * GET/PUT/PATCH/DELETE /product-parents/{productParentId} and
   * POST /product-parents/{productParentId}/archive
   * (https://docs.brinkcommerce.com/technical/api-references/management/product/product-parents.md):
   * no collection GET, and no paging parameter anywhere.
   */
  async listProducts(_credentials: Credentials, _params: QueryParams): Promise<Product[]> {
    throw notSupported(
      'Brink Commerce cannot list products: the Product Management API documents only ' +
        '"GET /product-parents/{productParentId}" (a read by id), no collection GET.',
    )
  }

  /**
   * GET /product-parents/{productParentId} ("Get a product parent"). Variants
   * are not embedded: a canonical variant requires a price that no documented
   * variant field carries (see getVariant).
   */
  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const resolved = this.resolveCredentials(credentials)
    const raw = await this.client(resolved).get<RawBrinkProductParent>(
      this.productBaseUrl(resolved),
      `/product-parents/${encodeURIComponent(id)}`,
    )
    return transformProduct(raw)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const resolved = this.resolveCredentials(credentials)
    const base = this.productBaseUrl(resolved)
    // Brink uses PUT with a client-generated UUID. Synthesise one from the title.
    const id =
      data.handle ?? data.title?.toLowerCase().replace(/[^a-z0-9]+/g, '-') ?? crypto.randomUUID()
    const raw = await this.client(resolved).put<RawBrinkProductParent>(
      base,
      `/product-parents/${id}`,
      untransformProduct(data),
    )
    return transformProduct(raw)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const resolved = this.resolveCredentials(credentials)
    const base = this.productBaseUrl(resolved)
    const raw = await this.client(resolved).patch<RawBrinkProductParent>(
      base,
      `/product-parents/${id}`,
      untransformProduct(data),
    )
    return transformProduct(raw)
  }

  // ── Variants ──────────────────────────────────────────────────────────────

  /**
   * Refused. GET /product-parents/{productParentId}/variants is documented
   * (https://docs.brinkcommerce.com/technical/api-references/management/product/product-variants.md),
   * but its rows cannot become canonical variants: see VARIANT_NO_PRICE.
   */
  async listVariants(_credentials: Credentials, _params: QueryParams): Promise<ProductVariant[]> {
    throw notSupported(`Brink Commerce cannot list variants: ${VARIANT_NO_PRICE}`)
  }

  /** Refused before any request, for the reason listVariants gives. */
  async getVariant(_credentials: Credentials, _id: string): Promise<ProductVariant> {
    throw notSupported(`Brink Commerce cannot read a variant: ${VARIANT_NO_PRICE}`)
  }

  async createVariant(
    credentials: Credentials,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    const resolved = this.resolveCredentials(credentials)
    const base = this.productBaseUrl(resolved)
    if (!data.productId) throw new Error('createVariant requires productId')
    const id = data.id ?? crypto.randomUUID()
    const raw = await this.client(resolved).put<RawBrinkProductVariant>(
      base,
      `/product-variants/${id}`,
      { ...untransformProductVariant(data), productParentId: data.productId },
    )
    return transformProductVariant(raw)
  }

  async updateVariant(
    credentials: Credentials,
    id: string,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    const resolved = this.resolveCredentials(credentials)
    const base = this.productBaseUrl(resolved)
    const raw = await this.client(resolved).patch<RawBrinkProductVariant>(
      base,
      `/product-variants/${id}`,
      untransformProductVariant(data),
    )
    return transformProductVariant(raw)
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  /**
   * One variant's stock: GET /product-variants/{productVariantId} on the Stock
   * service returns { id, inventories: [{ inventoryId, quantity, created,
   * updated }], stockQuantity, validateStock }
   * (https://docs.brinkcommerce.com/technical/api-references/management/stock/product-variant-inventories.md).
   * That is every level of the variant in one response, sliced locally. No
   * documented route returns stock for all variants, so a call without
   * `variantId` is refused.
   */
  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    const variantId = stringParam(params, 'variantId', 'variant_id')
    if (!variantId) {
      throw notSupported(
        'Brink Commerce cannot list inventory levels without a variantId: stock is read per ' +
          'variant ("GET /product-variants/{productVariantId}"), and no route lists all variants.',
      )
    }
    const resolved = this.resolveCredentials(credentials)
    const raw = await this.client(resolved).get<RawBrinkVariantStock>(
      this.stockBaseUrl(resolved),
      `/product-variants/${encodeURIComponent(variantId)}`,
    )
    return pageLocally(transformVariantStock(raw), params)
  }

  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    const resolved = this.resolveCredentials(credentials)
    const base = this.stockBaseUrl(resolved)
    const raw = await this.client(resolved).put<RawBrinkInventory>(
      base,
      `/product-variants/${data.variantId}/inventories/${data.locationId}`,
      { quantity: data.available },
    )
    return transformInventoryLevel(raw)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  /**
   * The OrderManagement API has no unfiltered order list. Its only multi-order
   * reads are GET /orders/email/{email} and GET /orders/merchant-ref1/{merchantRef1}
   * (https://docs.brinkcommerce.com/technical/api-references/order/orders.md), each
   * taking only optional `from` / `to` ("RFC3339 time stamp in UTC") and
   * returning `{ orderSummaries: [...] }`, documented as "Max 100 orders are
   * returned".
   *
   * A call with `email` or `merchantRef` gets that whole answer sliced
   * locally. A full 100 may be truncated, so it reports no total and leaves
   * `hasMore` unknown on its last local page instead of claiming the end.
   * A call with neither (every call the unified router makes) is refused.
   */
  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const email = stringParam(params, 'email')
    const merchantRef = stringParam(params, 'merchantRef')
    if (!email && !merchantRef) {
      throw notSupported(
        'Brink Commerce cannot list orders without an email or merchantRef: its only order ' +
          'lists are "GET /orders/email/{email}" and "GET /orders/merchant-ref1/{merchantRef1}".',
      )
    }
    const path = email
      ? `/orders/email/${encodeURIComponent(email)}`
      : `/orders/merchant-ref1/${encodeURIComponent(merchantRef!)}`
    const query: Record<string, string> = {}
    const from = stringParam(params, 'from')
    const to = stringParam(params, 'to')
    if (from) query['from'] = from
    if (to) query['to'] = to

    const resolved = this.resolveCredentials(credentials)
    const res = await this.client(resolved).get<{ orderSummaries: RawBrinkOrderSummary[] }>(
      this.orderBaseUrl(resolved),
      path,
      query,
    )
    const rows = res.orderSummaries.map(transformOrderSummary)
    const page = pageLocally(rows, params)
    if (rows.length >= ORDER_FILTER_CAP) {
      // At the cap the set may be truncated: the total is unknown, and so is
      // whether anything lies past the last row in hand.
      const more = readUpstreamPage(params)?.hasMore === true
      reportUpstreamPage(params, { totalCount: undefined, hasMore: more ? true : undefined })
    }
    return page
  }

  /** GET /orders/{orderId} ("Get order by id"), returning an `Order`. */
  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const resolved = this.resolveCredentials(credentials)
    const raw = await this.client(resolved).get<RawBrinkOrder>(
      this.orderBaseUrl(resolved),
      `/orders/${encodeURIComponent(id)}`,
    )
    return transformOrder(raw)
  }

  async cancelOrder(
    credentials: Credentials,
    id: string,
    data?: { reason?: string },
  ): Promise<Order> {
    const resolved = this.resolveCredentials(credentials)
    const base = this.orderBaseUrl(resolved)
    // Brink cancel: POST /orders/{id}/cancel → returns cancellation object;
    // re-fetch the order to return the updated canonical shape.
    await this.client(resolved).post<unknown>(
      base,
      `/orders/${id}/cancel`,
      data?.reason ? { reason: { cause: data.reason } } : {},
    )
    const raw = await this.client(resolved).get<RawBrinkOrder>(base, `/orders/${id}`)
    return transformOrder(raw)
  }

  // ── Fulfillments ──────────────────────────────────────────────────────────

  /**
   * GET /orders/{orderId}/deliveries ("Get deliveries made for an order")
   * returns `{ deliveries: [...] }`, the order's whole set, sliced locally
   * (https://docs.brinkcommerce.com/technical/api-references/order/deliveries.md).
   * No route lists deliveries across orders, so a call without `orderId` is refused.
   */
  async listFulfillments(credentials: Credentials, params: QueryParams): Promise<Fulfillment[]> {
    const orderId = stringParam(params, 'orderId', 'order_id')
    if (!orderId) {
      throw notSupported(
        'Brink Commerce cannot list fulfillments without an orderId: deliveries are listed ' +
          'per order ("GET /orders/{orderId}/deliveries").',
      )
    }
    const resolved = this.resolveCredentials(credentials)
    const res = await this.client(resolved).get<{ deliveries: RawBrinkDelivery[] }>(
      this.orderBaseUrl(resolved),
      `/orders/${encodeURIComponent(orderId)}/deliveries`,
    )
    return pageLocally(res.deliveries.map(transformDelivery), params)
  }

  /** GET /deliveries/{deliveryId} ("Get delivery"). */
  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    const resolved = this.resolveCredentials(credentials)
    const raw = await this.client(resolved).get<RawBrinkDelivery>(
      this.orderBaseUrl(resolved),
      `/deliveries/${encodeURIComponent(id)}`,
    )
    return transformDelivery(raw)
  }

  async createFulfillment(
    credentials: Credentials,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    if (!data.orderId) throw new Error('createFulfillment requires orderId')
    const resolved = this.resolveCredentials(credentials)
    const base = this.orderBaseUrl(resolved)
    const raw = await this.client(resolved).post<RawBrinkDelivery>(
      base,
      `/orders/${data.orderId}/deliveries`,
      untransformDelivery(data),
    )
    return transformDelivery(raw)
  }

  async updateFulfillment(
    credentials: Credentials,
    id: string,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    const resolved = this.resolveCredentials(credentials)
    const base = this.orderBaseUrl(resolved)
    const raw = await this.client(resolved).put<RawBrinkDelivery>(
      base,
      `/deliveries/${id}`,
      untransformDelivery(data),
    )
    return transformDelivery(raw)
  }

  async cancelFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    const resolved = this.resolveCredentials(credentials)
    const base = this.orderBaseUrl(resolved)
    // Deleting an unstarted delivery is the cancel equivalent in Brink.
    await this.client(resolved).delete(base, `/deliveries/${id}`)
    // Return the last known state (Brink returns 204 on delete; re-fetch may fail).
    // We synthesise a minimal cancelled-state fulfillment.
    return {
      id,
      orderId: '',
      status: 'CANCELLED',
      metadata: { deleted: true },
    }
  }

  // ── Refunds ───────────────────────────────────────────────────────────────

  /**
   * GET /orders/{orderId}/refunds ("Get all refunds made for an order")
   * returns `{ refunds: [...] }`, the order's whole set, sliced locally
   * (https://docs.brinkcommerce.com/technical/api-references/order/refunds.md).
   * No route lists refunds across orders, so a call without `orderId` is refused.
   */
  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const orderId = stringParam(params, 'orderId', 'order_id')
    if (!orderId) {
      throw notSupported(
        'Brink Commerce cannot list refunds without an orderId: refunds are listed per ' +
          'order ("GET /orders/{orderId}/refunds").',
      )
    }
    const resolved = this.resolveCredentials(credentials)
    const res = await this.client(resolved).get<{ refunds: RawBrinkRefund[] }>(
      this.orderBaseUrl(resolved),
      `/orders/${encodeURIComponent(orderId)}/refunds`,
    )
    return pageLocally(res.refunds.map(transformRefund), params)
  }

  /** GET /refunds/{refundId} ("Get refund"). */
  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const resolved = this.resolveCredentials(credentials)
    const raw = await this.client(resolved).get<RawBrinkRefund>(
      this.orderBaseUrl(resolved),
      `/refunds/${encodeURIComponent(id)}`,
    )
    return transformRefund(raw)
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.orderId) throw new Error('createRefund requires orderId')
    const resolved = this.resolveCredentials(credentials)
    const base = this.orderBaseUrl(resolved)
    const raw = await this.client(resolved).post<RawBrinkRefund>(
      base,
      `/orders/${data.orderId}/refunds`,
      untransformRefund(data),
    )
    return transformRefund(raw)
  }

  // ── Discounts ─────────────────────────────────────────────────────────────

  /**
   * Refused. The Discount Management API documents POST /discounts/runs,
   * POST /discounts/codes and GET/PUT/DELETE /discounts/codes/{code}; its rule
   * and bundle reads are by id too
   * (https://docs.brinkcommerce.com/technical/api-references/management/discount/discounts.md).
   * No collection GET exists.
   */
  async listDiscounts(_credentials: Credentials, _params: QueryParams): Promise<Discount[]> {
    throw notSupported(
      'Brink Commerce cannot list discounts: the Discount Management API reads codes only ' +
        'one at a time ("GET /discounts/codes/{code}"), with no collection GET.',
    )
  }

  /** GET /discounts/codes/{code} ("Get discount code"); the id is the code. */
  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const resolved = this.resolveCredentials(credentials)
    const raw = await this.client(resolved).get<RawBrinkDiscountCodeResponse>(
      this.discountBaseUrl(resolved),
      `/discounts/codes/${encodeURIComponent(id)}`,
    )
    return transformDiscountCode(raw)
  }

  async createDiscount(credentials: Credentials, data: Partial<Discount>): Promise<Discount> {
    const resolved = this.resolveCredentials(credentials)
    const base = this.discountBaseUrl(resolved)
    const client = this.client(resolved)
    // Create rule first, then create the code linked to it.
    const ruleId = crypto.randomUUID()
    const rule = await client.put<RawBrinkDiscountRule>(
      base,
      `/discount-rules/${ruleId}`,
      untransformDiscountRule(data),
    )
    const codeId = crypto.randomUUID()
    const code = await client.put<RawBrinkDiscountCode>(base, `/discount-codes/${codeId}`, {
      ...untransformDiscountCode(data),
      discountRuleId: rule.id,
    })
    return transformDiscount(code, rule)
  }

  async updateDiscount(
    credentials: Credentials,
    id: string,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const resolved = this.resolveCredentials(credentials)
    const base = this.discountBaseUrl(resolved)
    const client = this.client(resolved)
    // Fetch the existing code to find its rule id.
    const existing = await client.get<RawBrinkDiscountCode>(base, `/discount-codes/${id}`)
    let rule: RawBrinkDiscountRule | undefined
    if (existing.discountRuleId) {
      rule = await client.put<RawBrinkDiscountRule>(
        base,
        `/discount-rules/${existing.discountRuleId}`,
        untransformDiscountRule(data),
      )
    }
    const code = await client.put<RawBrinkDiscountCode>(
      base,
      `/discount-codes/${id}`,
      untransformDiscountCode(data),
    )
    return transformDiscount(code, rule)
  }

  async deleteDiscount(credentials: Credentials, id: string): Promise<void> {
    const resolved = this.resolveCredentials(credentials)
    const base = this.discountBaseUrl(resolved)
    await this.client(resolved).delete(base, `/discount-codes/${id}`)
  }
}
