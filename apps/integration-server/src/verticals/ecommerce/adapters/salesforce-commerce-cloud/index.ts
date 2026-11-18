/**
 * Salesforce Commerce Cloud B2C Commerce API (SCAPI) adapter for the ecommerce vertical.
 *
 * Maps the SCAPI Shopper APIs to the canonical ecommerce resources.
 *
 * Auth model:
 *   - Admin API: Account Manager `client_credentials` (short-lived JWTs, ~30 min).
 *     `refreshCredentials` re-issues a new token automatically.
 *   - Shopper API: SLAS `authorization_code` or `client_credentials` for guests.
 *
 * Base URL:
 *   https://{shortCode}.api.commercecloud.salesforce.com/{apiFamily}/{apiName}/v1/organizations/{organizationId}
 *
 * Supported resources:
 *   - Products (read via Shopper Products; write via admin)
 *   - Collections (SCAPI categories)
 *   - Customers (Shopper Customers)
 *   - Orders (Shopper Orders)
 *   - Fulfillments (shipments embedded in Orders)
 *   - Discounts (Shopper Promotions)
 *   - Inventory Levels (OCI / Product Inventory Records)
 *   - Locations (Shopper Stores)
 *
 * NOT supported (no canonical SCAPI equivalent):
 *   - Refunds       → SCAPI Order returns are managed in OMS; no simple REST endpoint
 *   - Transactions  → SCAPI payment transactions are platform-internal
 *   - Variants      → variants are embedded in Product; listed via listProducts
 *   - Webhooks      → SCAPI uses Order Management System hooks, not a standard webhook spec
 *
 * ── Resource coverage ──────────────────────────────────────────────────────────
 * Unavailable: refund      — SCAPI has no refund REST endpoint; returns are OMS-only
 * Unavailable: transaction — SCAPI payment transactions are platform-internal; ShopperPayments
 *                            manages saved payment method references only, not the canonical
 *                            AUTHORIZATION/CAPTURE/REFUND/VOID transaction lifecycle
 *
 * Docs: https://developer.salesforce.com/docs/commerce/commerce-api/guide/scapi-get-started.html
 */

import type { CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { Collection } from '../../schema/collection'
import type { Location } from '../../schema/location'
import type { InventoryLevel } from '../../schema/inventory'
import type { Customer } from '../../schema/customer'
import type { Order } from '../../schema/order'
import type { Fulfillment } from '../../schema/fulfillment'
import type { Discount } from '../../schema/discount'

import {
  CREDENTIAL_FIELDS as SCAPI_CREDENTIAL_FIELDS,
  exchangeCredentials as scapiExchangeCredentials,
  normaliseOrganizationId,
  normaliseShortCode,
  normaliseSiteId,
  requestAdminToken,
  requestShopperToken,
  refreshToken as slasRefreshToken,
  type ScapiInstance,
} from './auth'
import { SalesforceCommerceCloudClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import {
  transformProduct,
  type RawScapiProduct,
} from './transform/product'
import {
  transformCollection,
  type RawScapiCategory,
} from './transform/collection'
import { transformLocation, type RawScapiStore } from './transform/location'
import { transformInventoryLevel, type RawScapiInventoryRecord } from './transform/inventory'
import {
  transformCustomer,
  untransformCustomer,
  type RawScapiCustomer,
} from './transform/customer'
import { transformOrder, untransformOrder, type RawScapiOrder, type RawScapiShipment as RawScapiOrderShipment } from './transform/order'
import { transformFulfillment, type RawScapiShipment } from './transform/fulfillment'
import {
  transformDiscount,
  type RawScapiPromotion,
} from './transform/discount'

const NO_REDIRECT_MESSAGE =
  'Salesforce Commerce Cloud connects with an API client’s client credentials: use the credential form (client ID, secret, short code, organization ID, site ID), not a browser redirect.'

// ── Config ────────────────────────────────────────────────────────────────────

export interface SalesforceCommerceCloudAdapterConfig {
  // Every field is a deployment-wide fallback: Connect Link connections carry
  // their own instance and client in `credentials.extra`.
  /** API client ID registered in Account Manager / SLAS. */
  clientId?: string
  /** API client secret. */
  clientSecret?: string
  /**
   * Eight-character realm identifier (shortCode) for routing to the merchant's
   * SCAPI host, e.g. `kv7kzm78`.
   */
  shortCode?: string
  /**
   * Organization ID, e.g. `f_ecom_zzte_053`.  All API paths begin with this.
   */
  organizationId?: string
  /**
   * Site / channel identifier used as the `siteId` query parameter on every
   * Shopper API request, e.g. `RefArch`.
   */
  siteId?: string
  /** OAuth2 redirect URI (used for SLAS authorization_code flow). */
  redirectUri?: string
  /** Override the default SLAS shopper scopes. */
  scopes?: string[]
  /**
   * Root category IDs used to seed listCollections().
   * SCAPI requires `?ids=...` on the /categories endpoint.
   * Defaults to ['root'] if not provided.
   */
  rootCategoryIds?: string[]
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class SalesforceCommerceCloudAdapter implements EcommerceAdapter {
  readonly platform = 'salesforce-commerce-cloud'
  readonly version = '0.1.0'

  private clientId: string | undefined
  private clientSecret: string | undefined
  private shortCode: string | undefined
  private organizationId: string | undefined
  private siteId: string | undefined
  private rootCategoryIds: string[]

  constructor(config: SalesforceCommerceCloudAdapterConfig = {}) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.shortCode = config.shortCode
    this.organizationId = config.organizationId
    this.siteId = config.siteId
    this.rootCategoryIds = config.rootCategoryIds ?? ['root']
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  /**
   * The SLAS client and the instance it belongs to are the customer's. SLAS's
   * authorization-code flow signs a *shopper* into a storefront, so it is not
   * offered; the private client's `client_credentials` grant is.
   */
  credentialFields(): CredentialField[] {
    return SCAPI_CREDENTIAL_FIELDS
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return scapiExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    throw new Error(NO_REDIRECT_MESSAGE)
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error(NO_REDIRECT_MESSAGE)
  }

  /**
   * Re-issue credentials on the connection's own instance: the refresh_token
   * grant when SLAS issued one, else a new client_credentials token. The
   * instance identifiers are carried over either way.
   */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    const instance = this.instance(credentials)
    if (credentials.refreshToken) {
      const fresh = await slasRefreshToken(
        instance.shortCode,
        instance.organizationId,
        instance.clientId,
        instance.clientSecret,
        credentials,
      )
      return { ...fresh, extra: credentials.extra }
    }
    return requestShopperToken(instance)
  }

  /**
   * Obtain a fresh Admin API token via client_credentials.
   * Callers that need admin-scope access (product writes, etc.) should use
   * this instead of `exchangeCode`.
   */
  async getAdminCredentials(): Promise<Credentials> {
    return requestAdminToken(this.clientId ?? '', this.clientSecret ?? '')
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /**
   * The instance a connection belongs to: from its credentials, else the
   * deployment-wide config. Throws a specific error for a missing or malformed
   * identifier before any URL is built.
   */
  private instance(credentials: Credentials): ScapiInstance {
    const extra = credentials.extra ?? {}
    const pick = (key: string, fallback: string | undefined): string | undefined => {
      const value = extra[key]
      return typeof value === 'string' && value.trim() ? value : fallback
    }
    return {
      shortCode: normaliseShortCode(pick('shortCode', this.shortCode)),
      organizationId: normaliseOrganizationId(pick('organizationId', this.organizationId)),
      siteId: normaliseSiteId(pick('siteId', this.siteId)),
      clientId: pick('clientId', this.clientId) ?? '',
      clientSecret: pick('clientSecret', this.clientSecret) ?? '',
    }
  }

  private client(credentials: Credentials): SalesforceCommerceCloudClient {
    const { shortCode, organizationId, siteId } = this.instance(credentials)
    return new SalesforceCommerceCloudClient(credentials, shortCode, organizationId, siteId)
  }

  private pageParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
      offset: (params['offset'] as number | undefined) ?? 0,
    }
    return out
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const query = (params['q'] as string | undefined) ?? ''
    const res = await this.client(credentials).searchProducts<RawScapiProduct>({
      query: { textQuery: { fields: ['name', 'id'], searchPhrase: query || '*' } },
      ...this.pageParams(params),
    })
    return res.items.map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const raw = await this.client(credentials).getProduct<RawScapiProduct>(id, {
      allImages: true,
      expand: ['images', 'variations', 'prices'],
    })
    return transformProduct(raw)
  }

  // updateProduct is intentionally omitted — SCAPI Admin PATCH requires a
  // separate Admin-API client and credentials scope not wired here.
  // The registry will surface a 501 Not Implemented for this method.

  // ── Collections (SCAPI Categories) ───────────────────────────────────────

  async listCollections(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Collection[]> {
    // SCAPI GET /categories requires the `ids` query parameter (400 without it).
    // We use the configured rootCategoryIds to seed the category list.
    const res = await this.client(credentials).getCategories<RawScapiCategory>(
      this.rootCategoryIds,
      this.pageParams(params),
    )
    return res.items.map((c) => transformCollection(c, 'MANUAL'))
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const raw = await this.client(credentials).getCategory<RawScapiCategory>(id)
    return transformCollection(raw, 'MANUAL')
  }

  // createCollection is intentionally omitted — it would require a silent
  // no-op without an Admin API client. The registry surfaces 501.

  // ── Locations (SCAPI Stores) ──────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    // Shopper Stores: GET /store/shopper-stores/v1/organizations/{orgId}/stores
    const res = await this.client(credentials).getStores<RawScapiStore>(
      this.pageParams(params),
    )
    return res.items.map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    // GET /store/shopper-stores/v1/organizations/{orgId}/stores/{storeId}
    const raw = await this.client(credentials).getStore<RawScapiStore>(id)
    return transformLocation(raw)
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    // SCAPI Product Inventory:
    //   GET /inventory/impex-inventory/v1/organizations/{orgId}/inventory-lists/{listId}/product-inventory-records
    // Callers must pass `inventoryListId` (the SCAPI inventory list) and optionally
    // `productIds` to scope the query.
    const inventoryListId =
      (params['inventoryListId'] as string | undefined) ??
      (params['inventory_list_id'] as string | undefined) ??
      this.siteId

    const productId =
      (params['productId'] as string | undefined) ??
      (params['variantId'] as string | undefined)

    // Without a dedicated Inventory client method we build a minimal record from
    // the Shopper Availability API expansion (embedded in product response).
    if (productId) {
      const raw = await this.client(credentials).getProduct<
        RawScapiProduct & { inventory?: { ats?: number; stockLevel?: number; updatedAt?: string; perpetual?: boolean } }
      >(productId, { expand: ['availability'] })

      const inv = raw.inventory
      const record: RawScapiInventoryRecord = {
        productId,
        inventoryListId,
        ats: inv?.ats ?? inv?.stockLevel,
        perpetual: inv?.perpetual,
        updatedAt: inv?.updatedAt,
      }
      return [transformInventoryLevel(record)]
    }

    return []
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  // listCustomers is intentionally omitted.
  // SCAPI Shopper Customers has no list/search endpoint accessible via the
  // Shopper API; customer search is an OCAPI Admin endpoint not wired here.
  // The registry surfaces 501 Not Implemented.

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const raw = await this.client(credentials).getCustomer<RawScapiCustomer>(id)
    return transformCustomer(raw)
  }

  async createCustomer(
    credentials: Credentials,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const raw = await this.client(credentials).createCustomer<RawScapiCustomer>(
      untransformCustomer(data),
    )
    return transformCustomer(raw)
  }

  async updateCustomer(
    credentials: Credentials,
    id: string,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const raw = await this.client(credentials).updateCustomer<RawScapiCustomer>(
      id,
      untransformCustomer(data),
    )
    return transformCustomer(raw)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    // SCAPI doesn't have a flat order list endpoint on the Shopper Orders API.
    // Orders are scoped to a customer.  When a customerId is provided, use it;
    // otherwise fall back to an empty list (admin order search requires OCAPI).
    const customerId =
      (params['customerId'] as string | undefined) ??
      (params['customer_id'] as string | undefined)

    if (!customerId) return []

    const res = await this.client(credentials).getCustomerOrders<RawScapiOrder>(
      customerId,
      this.pageParams(params),
    )
    return res.items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const raw = await this.client(credentials).getOrder<RawScapiOrder>(id)
    return transformOrder(raw)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    // SCAPI order creation requires an active basket.  We create a basket, add
    // items, then submit it as an order via the checkout apiFamily endpoint.
    const client = this.client(credentials)

    // 1. Create a basket.
    const basket = await client.createBasket<{ basketId: string }>(
      untransformOrder(data),
    )
    const basketId = basket.basketId

    // 2. Add product items.
    for (const li of data.lineItems ?? []) {
      await client.addItemToBasket(basketId, {
        productId: li.productId,
        quantity: li.quantity,
      })
    }

    // 3. Submit basket as order via POST /checkout/shopper-orders/v1/.../orders
    const raw = await client.createOrder<RawScapiOrder>({ basketId })
    return transformOrder(raw)
  }

  // ── Fulfillments (shipments embedded in orders) ───────────────────────────

  async listFulfillments(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Fulfillment[]> {
    const orderId =
      (params['orderId'] as string | undefined) ??
      (params['order_id'] as string | undefined)
    if (!orderId) throw new Error('listFulfillments requires `orderId` in query params')

    const raw = await this.client(credentials).getOrder<RawScapiOrder>(orderId)
    return (raw.shipments ?? []).map((s: RawScapiOrderShipment) =>
      transformFulfillment(s as unknown as RawScapiShipment, orderId),
    )
  }

  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    // SCAPI shipments are embedded in the order.  ID format: `orderNo:shipmentId`.
    const [orderNo, shipmentId] = id.split(':')
    if (!orderNo || !shipmentId) {
      throw new Error('Invalid fulfillment id format: expected `orderNo:shipmentId`')
    }
    const raw = await this.client(credentials).getOrder<RawScapiOrder>(orderNo)
    const shipment = (raw.shipments ?? []).find(
      (s: RawScapiOrderShipment) => s.shipmentId === shipmentId,
    )
    if (!shipment) throw new Error(`Shipment ${shipmentId} not found on order ${orderNo}`)
    return transformFulfillment(shipment as unknown as RawScapiShipment, orderNo)
  }

  // ── Discounts (SCAPI Promotions) ──────────────────────────────────────────

  async listDiscounts(credentials: Credentials, _params: QueryParams): Promise<Discount[]> {
    // Shopper Promotions: GET /pricing/shopper-promotions/v1/organizations/{orgId}/promotions
    // Returns promotions visible to the current shopper (active, public-facing).
    const res = await this.client(credentials).getPromotions<RawScapiPromotion>()
    return res.items.map(transformDiscount)
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    // GET /pricing/shopper-promotions/v1/organizations/{orgId}/promotions/{promotionId}
    const raw = await this.client(credentials).getPromotion<RawScapiPromotion>(id)
    return transformDiscount(raw)
  }
}
