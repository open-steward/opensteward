/**
 * Znode Commerce adapter for the ecommerce vertical.
 *
 * Maps the Znode REST API surface to the canonical ecommerce resources.
 * Notable Znode-isms:
 *
 *  - **B2B platform**: Znode Account = company/organization, NOT a person.
 *    AccountUser = person. The canonical Customer schema is forced into
 *    an awkward mapping where `firstName` = company name (same as OroCommerce).
 *  - **Standard REST API**: All responses use JSON with PascalCase field names.
 *    List responses wrap data in keyed envelopes: `{Products: [...], TotalResults: N}`.
 *  - **OAuth2 client-credentials**: No authorization code exchange.
 *  - **No native webhooks**: `verifyWebhook` and `parseWebhookEvents`
 *    are omitted.
 *  - **No fulfillments, refunds, or transactions**: Znode has no native
 *    REST resources for these concepts (order line-item statuses serve instead).
 *
 * Coverage: ~25 of 42 interface methods implemented.
 */

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: fulfillment  — Znode has no dedicated fulfillment REST resource; shipment state is encoded in OrderStateId (3=Shipped, 4=Delivered) on the order object.
// Unavailable: refund       — Znode has no dedicated refund REST resource; return/refund state is encoded in OrderStateId (6=Returned) on the order object.
// Unavailable: transaction  — Znode has no payment transaction REST resource; payment is handled by external gateway integrations with no transaction sub-resource exposed via the API.

import type { Credentials, QueryParams } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product, ProductVariant } from '../../schema/product'
import type { Collection } from '../../schema/collection'
import type { Location } from '../../schema/location'
import type { InventoryLevel } from '../../schema/inventory'
import type { Customer } from '../../schema/customer'
import type { Order } from '../../schema/order'
import type { Discount } from '../../schema/discount'

import { oauth2ClientCredentials } from '@opensteward/shared'
import {
  buildAuthUrl,
  exchangeCode as znodeExchangeCode,
  refreshCredentials as znodeRefreshCredentials,
} from './auth'
import { ZnodeClient } from './client'
import { DEFAULT_PAGE_SIZE, TOKEN_ENDPOINT } from './constants'

const CREDENTIAL_FORM = oauth2ClientCredentials({
  tokenUrl: (input) => {
    const baseUrl = (input.baseUrl ?? '').trim().replace(/\/$/, '')
    if (!baseUrl) throw new Error('Store URL is required.')
    return `${baseUrl}${TOKEN_ENDPOINT}`
  },
  additionalFields: [
    {
      name: 'baseUrl',
      label: 'Store URL',
      type: 'url',
      required: true,
      placeholder: 'https://your-znode-site.example',
      helpText: 'Base URL of your Znode storefront (no trailing slash).',
    },
  ],
})

import {
  transformProduct,
  untransformProduct,
  transformProductVariant,
  untransformProductVariant,
  type RawZnodeProduct,
} from './transform/product'
import {
  transformCollection,
  untransformCollection,
  type RawZnodeCategory,
} from './transform/collection'
import {
  transformLocation,
  type RawZnodeWarehouse,
} from './transform/location'
import {
  transformInventoryLevel,
  type RawZnodeInventory,
} from './transform/inventory'
import {
  transformCustomer,
  untransformCustomer,
  type RawZnodeAccount,
} from './transform/customer'
import {
  transformOrder,
  untransformOrder,
  type RawZnodeOrder,
} from './transform/order'
import {
  transformDiscount,
  untransformDiscount,
  type RawZnodePromotion,
} from './transform/discount'

export interface ZnodeAdapterConfig {
  baseUrl?: string
  clientId?: string
  clientSecret?: string
}

export class ZnodeAdapter implements EcommerceAdapter {
  readonly platform = 'znode'
  readonly version = '0.1.0'

  credentialFields = CREDENTIAL_FORM.credentialFields
  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  private configBaseUrl: string | undefined
  private configClientId: string | undefined
  private configClientSecret: string | undefined

  constructor(config: ZnodeAdapterConfig = {}) {
    this.configBaseUrl = config.baseUrl
    this.configClientId = config.clientId
    this.configClientSecret = config.clientSecret
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    return buildAuthUrl(this.configBaseUrl ?? 'https://your-znode-site.example')
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    return znodeExchangeCode()
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return znodeRefreshCredentials(credentials)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private clientFor(credentials: Credentials): ZnodeClient {
    const baseUrl =
      (credentials.extra?.['baseUrl'] as string | undefined) ?? this.configBaseUrl
    const clientId =
      (credentials.extra?.['clientId'] as string | undefined) ?? this.configClientId
    const clientSecret =
      (credentials.extra?.['clientSecret'] as string | undefined) ?? this.configClientSecret

    if (!baseUrl) {
      throw new Error(
        'Znode adapter is missing baseUrl — either configure it in ' +
          'config or POST it to /v1/connections with credentials: {baseUrl, clientId, clientSecret}.',
      )
    }
    if (!credentials.accessToken && (!clientId || !clientSecret)) {
      throw new Error(
        'Znode adapter needs either an accessToken or (clientId + clientSecret) ' +
          'to mint one. Re-create the connection with the required fields.',
      )
    }

    const mergedCreds: Credentials = {
      ...credentials,
      accessToken: credentials.accessToken || 'pending',
      extra: {
        ...credentials.extra,
        baseUrl,
        ...(clientId ? { clientId } : {}),
        ...(clientSecret ? { clientSecret } : {}),
      },
    }
    return new ZnodeClient(mergedCreds)
  }

  private pageParams(params: QueryParams): { pageIndex: number; pageSize: number } {
    return {
      pageIndex: params.page ?? 1,
      pageSize: params.limit ?? DEFAULT_PAGE_SIZE,
    }
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const { pageIndex, pageSize } = this.pageParams(params)
    const res = await this.clientFor(credentials).list<RawZnodeProduct>(
      'products',
      'Products',
      { pageIndex, pageSize },
    )
    return res.items.map((p) => transformProduct(p))
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const client = this.clientFor(credentials)
    const envelope = await client.get<{ Product: RawZnodeProduct }>(
      `products/${encodeURIComponent(id)}`,
    )
    const raw = envelope.Product ?? (envelope as unknown as RawZnodeProduct)

    // Fetch associated products (variants) if present
    let children: RawZnodeProduct[] | undefined
    if (raw.AssociatedProducts && raw.AssociatedProducts.length > 0) {
      children = raw.AssociatedProducts
    } else if (raw.ProductType === 2) {
      // Configurable product — try to fetch associated products
      try {
        const assocRes = await client.list<RawZnodeProduct>(
          `products/${encodeURIComponent(id)}/associatedproducts`,
          'Products',
          { pageSize: 100 },
        )
        if (assocRes.items.length > 0) {
          children = assocRes.items
        }
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
    const body = untransformProduct(data)
    const res = await this.clientFor(credentials).post<{ Product: RawZnodeProduct }>(
      'products',
      body,
    )
    const raw = res.Product ?? (res as unknown as RawZnodeProduct)
    return transformProduct(raw)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const body = untransformProduct(data)
    const res = await this.clientFor(credentials).put<{ Product: RawZnodeProduct }>(
      `products/${encodeURIComponent(id)}`,
      { ...body, ZnodeProductId: Number(id) },
    )
    const raw = res.Product ?? (res as unknown as RawZnodeProduct)
    return transformProduct(raw)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`products/${encodeURIComponent(id)}`)
  }

  // ── Variants ──────────────────────────────────────────────────────────────

  async listVariants(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<ProductVariant[]> {
    const productId = (params['productId'] ?? params['product_id']) as string | undefined
    if (!productId) {
      throw new Error(
        'Znode requires ?productId= for listVariants; variants are associated ' +
          'products of a configurable parent.',
      )
    }
    const client = this.clientFor(credentials)
    const { pageIndex, pageSize } = this.pageParams(params)
    const res = await client.list<RawZnodeProduct>(
      `products/${encodeURIComponent(productId)}/associatedproducts`,
      'Products',
      { pageIndex, pageSize },
    )
    return res.items.map((p) => transformProductVariant(p, productId))
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    const client = this.clientFor(credentials)
    const envelope = await client.get<{ Product: RawZnodeProduct }>(
      `products/${encodeURIComponent(id)}`,
    )
    const raw = envelope.Product ?? (envelope as unknown as RawZnodeProduct)
    return transformProductVariant(raw, '')
  }

  async createVariant(
    credentials: Credentials,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    const parentId = data.productId
    if (!parentId) {
      throw new Error('Znode createVariant requires productId (parent product id)')
    }
    const client = this.clientFor(credentials)
    // Create the child product first
    const childBody = untransformProductVariant(data)
    const childRes = await client.post<{ Product: RawZnodeProduct }>('products', childBody)
    const child = childRes.Product ?? (childRes as unknown as RawZnodeProduct)
    const childId = String(child.ZnodeProductId ?? '')

    // Associate it with the parent
    await client.post(`products/${encodeURIComponent(parentId)}/associatedproducts`, {
      ProductId: Number(childId),
    })

    return transformProductVariant(child, parentId)
  }

  async updateVariant(
    credentials: Credentials,
    id: string,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    const client = this.clientFor(credentials)
    const body = untransformProductVariant(data)
    const res = await client.put<{ Product: RawZnodeProduct }>(
      `products/${encodeURIComponent(id)}`,
      { ...body, ZnodeProductId: Number(id) },
    )
    const raw = res.Product ?? (res as unknown as RawZnodeProduct)
    return transformProductVariant(raw, data.productId ?? '')
  }

  async deleteVariant(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`products/${encodeURIComponent(id)}`)
  }

  // ── Collections ───────────────────────────────────────────────────────────

  async listCollections(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Collection[]> {
    const { pageIndex, pageSize } = this.pageParams(params)
    const res = await this.clientFor(credentials).list<RawZnodeCategory>(
      'categories',
      'Categories',
      { pageIndex, pageSize },
    )
    return res.items.map((c) => transformCollection(c))
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const envelope = await this.clientFor(credentials).get<{ Category: RawZnodeCategory }>(
      `categories/${encodeURIComponent(id)}`,
    )
    const raw = envelope.Category ?? (envelope as unknown as RawZnodeCategory)
    return transformCollection(raw)
  }

  async createCollection(
    credentials: Credentials,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const body = untransformCollection(data)
    const res = await this.clientFor(credentials).post<{ Category: RawZnodeCategory }>(
      'categories',
      body,
    )
    const raw = res.Category ?? (res as unknown as RawZnodeCategory)
    return transformCollection(raw)
  }

  async updateCollection(
    credentials: Credentials,
    id: string,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const body = untransformCollection(data)
    const res = await this.clientFor(credentials).put<{ Category: RawZnodeCategory }>(
      `categories/${encodeURIComponent(id)}`,
      { ...body, CategoryId: Number(id) },
    )
    const raw = res.Category ?? (res as unknown as RawZnodeCategory)
    return transformCollection(raw)
  }

  async deleteCollection(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`categories/${encodeURIComponent(id)}`)
  }

  // ── Locations ─────────────────────────────────────────────────────────────

  async listLocations(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Location[]> {
    const { pageIndex, pageSize } = this.pageParams(params)
    const res = await this.clientFor(credentials).list<RawZnodeWarehouse>(
      'warehouses',
      'Warehouses',
      { pageIndex, pageSize },
    )
    return res.items.map((w) => transformLocation(w))
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const envelope = await this.clientFor(credentials).get<{ Warehouse: RawZnodeWarehouse }>(
      `warehouses/${encodeURIComponent(id)}`,
    )
    const raw = envelope.Warehouse ?? (envelope as unknown as RawZnodeWarehouse)
    return transformLocation(raw)
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    const { pageIndex, pageSize } = this.pageParams(params)
    const filters: Record<string, string> = {}
    const productId = (params['productId'] ?? params['product_id'] ?? params['variantId']) as string | undefined
    const warehouseId = (params['warehouseId'] ?? params['locationId']) as string | undefined
    if (productId) filters['productId'] = productId
    if (warehouseId) filters['warehouseId'] = warehouseId

    const res = await this.clientFor(credentials).list<RawZnodeInventory>(
      'inventory',
      'Inventories',
      { pageIndex, pageSize, filters },
    )
    return res.items.map((il) => transformInventoryLevel(il))
  }

  async getInventoryLevel(
    credentials: Credentials,
    id: string,
  ): Promise<InventoryLevel> {
    const envelope = await this.clientFor(credentials).get<{ Inventory: RawZnodeInventory }>(
      `inventory/${encodeURIComponent(id)}`,
    )
    const raw = envelope.Inventory ?? (envelope as unknown as RawZnodeInventory)
    return transformInventoryLevel(raw)
  }

  async adjustInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; delta: number },
  ): Promise<InventoryLevel> {
    // Read-modify-write: get current level, then set new value
    const client = this.clientFor(credentials)
    const res = await client.list<RawZnodeInventory>('inventory', 'Inventories', {
      pageSize: 1,
      filters: { productId: data.variantId, warehouseId: data.locationId },
    })
    const current = res.items[0]
    const currentQty = current?.Quantity ?? 0
    const newQty = currentQty + data.delta
    const invId = current?.InventoryId

    if (invId != null) {
      const updated = await client.put<{ Inventory: RawZnodeInventory }>(
        `inventory/${encodeURIComponent(String(invId))}`,
        { InventoryId: invId, Quantity: newQty, ProductId: Number(data.variantId), WarehouseId: Number(data.locationId) },
      )
      const raw = updated.Inventory ?? (updated as unknown as RawZnodeInventory)
      return transformInventoryLevel(raw)
    }

    // No existing level found — return a synthesized one
    return {
      id: `${data.variantId}:${data.locationId}`,
      variantId: data.variantId,
      locationId: data.locationId,
      available: newQty,
      metadata: {
        ProductId: Number(data.variantId),
        WarehouseId: Number(data.locationId),
        Quantity: newQty,
      },
    }
  }

  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    const client = this.clientFor(credentials)
    const res = await client.list<RawZnodeInventory>('inventory', 'Inventories', {
      pageSize: 1,
      filters: { productId: data.variantId, warehouseId: data.locationId },
    })
    const existing = res.items[0]

    if (existing?.InventoryId != null) {
      const updated = await client.put<{ Inventory: RawZnodeInventory }>(
        `inventory/${encodeURIComponent(String(existing.InventoryId))}`,
        {
          InventoryId: existing.InventoryId,
          Quantity: data.available,
          ProductId: Number(data.variantId),
          WarehouseId: Number(data.locationId),
        },
      )
      const raw = updated.Inventory ?? (updated as unknown as RawZnodeInventory)
      return transformInventoryLevel(raw)
    }

    return {
      id: `${data.variantId}:${data.locationId}`,
      variantId: data.variantId,
      locationId: data.locationId,
      available: data.available,
      metadata: {
        ProductId: Number(data.variantId),
        WarehouseId: Number(data.locationId),
        Quantity: data.available,
      },
    }
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  async listCustomers(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Customer[]> {
    const { pageIndex, pageSize } = this.pageParams(params)
    const res = await this.clientFor(credentials).list<RawZnodeAccount>(
      'accounts',
      'Accounts',
      { pageIndex, pageSize },
    )
    return res.items.map((c) => transformCustomer(c))
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const envelope = await this.clientFor(credentials).get<{ Account: RawZnodeAccount }>(
      `accounts/${encodeURIComponent(id)}`,
    )
    const raw = envelope.Account ?? (envelope as unknown as RawZnodeAccount)
    return transformCustomer(raw)
  }

  async createCustomer(
    credentials: Credentials,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const body = untransformCustomer(data)
    const res = await this.clientFor(credentials).post<{ Account: RawZnodeAccount }>(
      'accounts',
      body,
    )
    const raw = res.Account ?? (res as unknown as RawZnodeAccount)
    return transformCustomer(raw)
  }

  async updateCustomer(
    credentials: Credentials,
    id: string,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const body = untransformCustomer(data)
    const res = await this.clientFor(credentials).put<{ Account: RawZnodeAccount }>(
      `accounts/${encodeURIComponent(id)}`,
      { ...body, AccountId: Number(id) },
    )
    const raw = res.Account ?? (res as unknown as RawZnodeAccount)
    return transformCustomer(raw)
  }

  async deleteCustomer(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`accounts/${encodeURIComponent(id)}`)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const { pageIndex, pageSize } = this.pageParams(params)
    const res = await this.clientFor(credentials).list<RawZnodeOrder>(
      'orders',
      'Orders',
      { pageIndex, pageSize },
    )
    return res.items.map((o) => transformOrder(o))
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const envelope = await this.clientFor(credentials).get<{ Order: RawZnodeOrder }>(
      `orders/${encodeURIComponent(id)}`,
    )
    const raw = envelope.Order ?? (envelope as unknown as RawZnodeOrder)
    return transformOrder(raw)
  }

  async createOrder(
    credentials: Credentials,
    data: Partial<Order>,
  ): Promise<Order> {
    const body = untransformOrder(data)
    const res = await this.clientFor(credentials).post<{ Order: RawZnodeOrder }>(
      'orders',
      body,
    )
    const raw = res.Order ?? (res as unknown as RawZnodeOrder)
    return transformOrder(raw)
  }

  async updateOrder(
    credentials: Credentials,
    id: string,
    data: Partial<Order>,
  ): Promise<Order> {
    const body = untransformOrder(data)
    const res = await this.clientFor(credentials).put<{ Order: RawZnodeOrder }>(
      `orders/${encodeURIComponent(id)}`,
      { ...body, OrderId: Number(id) },
    )
    const raw = res.Order ?? (res as unknown as RawZnodeOrder)
    return transformOrder(raw)
  }

  async cancelOrder(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Order> {
    // Cancel by PUT-ing the order state to cancelled (5)
    const res = await this.clientFor(credentials).put<{ Order: RawZnodeOrder }>(
      `orders/${encodeURIComponent(id)}`,
      {
        OrderId: Number(id),
        OrderStateId: 5,
      },
    )
    const raw = res.Order ?? (res as unknown as RawZnodeOrder)
    return transformOrder(raw)
  }

  // ── Discounts ─────────────────────────────────────────────────────────────

  async listDiscounts(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Discount[]> {
    const { pageIndex, pageSize } = this.pageParams(params)
    const res = await this.clientFor(credentials).list<RawZnodePromotion>(
      'promotions',
      'Promotions',
      { pageIndex, pageSize },
    )
    return res.items.map((p) => transformDiscount(p))
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const envelope = await this.clientFor(credentials).get<{ Promotion: RawZnodePromotion }>(
      `promotions/${encodeURIComponent(id)}`,
    )
    const raw = envelope.Promotion ?? (envelope as unknown as RawZnodePromotion)
    return transformDiscount(raw)
  }

  async createDiscount(
    credentials: Credentials,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const body = untransformDiscount(data)
    const res = await this.clientFor(credentials).post<{ Promotion: RawZnodePromotion }>(
      'promotions',
      body,
    )
    const raw = res.Promotion ?? (res as unknown as RawZnodePromotion)
    return transformDiscount(raw)
  }

  async updateDiscount(
    credentials: Credentials,
    id: string,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const body = untransformDiscount(data)
    const res = await this.clientFor(credentials).put<{ Promotion: RawZnodePromotion }>(
      `promotions/${encodeURIComponent(id)}`,
      { ...body, PromotionId: Number(id) },
    )
    const raw = res.Promotion ?? (res as unknown as RawZnodePromotion)
    return transformDiscount(raw)
  }

  async deleteDiscount(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`promotions/${encodeURIComponent(id)}`)
  }
}
