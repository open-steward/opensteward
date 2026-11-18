/**
 * OroCommerce adapter for the ecommerce vertical.
 *
 * Maps the OroCommerce JSON:API REST surface to the canonical ecommerce
 * resources. Notable OroCommerce-isms:
 *
 *  - **First B2B adapter**: Oro Customer = company, NOT a person.
 *    CustomerUser = person. The canonical Customer schema is forced
 *    into an awkward mapping where `firstName` = company name.
 *  - **JSON:API format**: All responses wrapped in
 *    `{data: {type, id, attributes, relationships}}`. Content-Type
 *    is `application/vnd.api+json`. Updates use PATCH, not PUT.
 *  - **OAuth2 client-credentials**: No authorization code exchange.
 *  - **No native webhooks**: `verifyWebhook` and `parseWebhookEvents`
 *    are omitted (same as Magento CE).
 *  - **No fulfillments, refunds, or transactions**: Oro has no native
 *    REST resources for these concepts.
 *
 * Coverage: 31 of 42 interface methods implemented.
 */

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: fulfillment — OroCommerce has no standalone fulfillment/shipment REST resource;
//              shipping tracking is embedded as OrderShippingTracking sub-entities on the order.
// Unavailable: refund — OroCommerce PaymentBundle does not expose refunds via its JSON:API layer;
//              refund operations are handled internally and are not accessible via REST.
// Unavailable: transaction — OroCommerce PaymentBundle does not expose payment transactions via
//              its JSON:API layer; the PaymentTransaction entity has no REST endpoint configured.

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
  exchangeCode as oroExchangeCode,
  refreshCredentials as oroRefreshCredentials,
} from './auth'
import { OroClient, type FlatResource } from './client'
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
      placeholder: 'https://your-oro-site.example',
      helpText: 'Base URL of your OroCommerce site (no trailing slash).',
    },
  ],
})

import {
  transformProduct,
  untransformProduct,
  transformProductVariant,
  untransformProductVariant,
  type RawOroProduct,
} from './transform/product'
import {
  transformCollection,
  untransformCollection,
  type RawOroCategory,
} from './transform/collection'
import {
  transformLocation,
  type RawOroWarehouse,
} from './transform/location'
import {
  transformInventoryLevel,
  type RawOroInventoryLevel,
} from './transform/inventory'
import {
  transformCustomer,
  untransformCustomer,
  type RawOroCustomer,
} from './transform/customer'
import {
  transformOrder,
  untransformOrder,
  type RawOroOrder,
} from './transform/order'
import {
  transformDiscount,
  untransformDiscount,
  type RawOroPromotion,
} from './transform/discount'

export interface OroCommerceAdapterConfig {
  baseUrl?: string
  clientId?: string
  clientSecret?: string
}

export class OroCommerceAdapter implements EcommerceAdapter {
  readonly platform = 'orocommerce'
  readonly version = '0.1.0'

  credentialFields = CREDENTIAL_FORM.credentialFields
  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  private configBaseUrl: string | undefined
  private configClientId: string | undefined
  private configClientSecret: string | undefined

  constructor(config: OroCommerceAdapterConfig = {}) {
    this.configBaseUrl = config.baseUrl
    this.configClientId = config.clientId
    this.configClientSecret = config.clientSecret
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    return buildAuthUrl(this.configBaseUrl ?? 'https://your-oro-site.example')
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    return oroExchangeCode()
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return oroRefreshCredentials(credentials)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private clientFor(credentials: Credentials): OroClient {
    const baseUrl =
      (credentials.extra?.['baseUrl'] as string | undefined) ?? this.configBaseUrl
    const clientId =
      (credentials.extra?.['clientId'] as string | undefined) ?? this.configClientId
    const clientSecret =
      (credentials.extra?.['clientSecret'] as string | undefined) ?? this.configClientSecret

    if (!baseUrl) {
      throw new Error(
        'OroCommerce adapter is missing baseUrl — either configure it in ' +
          'config or POST it to /v1/connections with credentials: {baseUrl, clientId, clientSecret}.',
      )
    }
    if (!credentials.accessToken && (!clientId || !clientSecret)) {
      throw new Error(
        'OroCommerce adapter needs either an accessToken or (clientId + clientSecret) ' +
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
    return new OroClient(mergedCreds)
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
    const res = await this.clientFor(credentials).listWithPage<FlatResource>(
      'products',
      { currentPage, pageSize },
    )
    return res.items.map((p) => transformProduct(p as unknown as RawOroProduct))
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const client = this.clientFor(credentials)
    const raw = await client.get<FlatResource>(`products/${encodeURIComponent(id)}`)
    const product = raw as unknown as RawOroProduct

    // Fetch child variants if this is a configurable product
    let children: RawOroProduct[] | undefined
    const relationships = product._relationships as Record<string, { data?: Array<{ id: string }> }> | undefined
    const variantLinks = relationships?.['variantProducts']?.data
    if (variantLinks && variantLinks.length > 0) {
      try {
        const childPromises = variantLinks.map((link) =>
          client.get<FlatResource>(`products/${encodeURIComponent(link.id)}`),
        )
        const childResults = await Promise.all(childPromises)
        children = childResults as unknown as RawOroProduct[]
      } catch {
        children = undefined
      }
    }

    return transformProduct(product, children)
  }

  async createProduct(
    credentials: Credentials,
    data: Partial<Product>,
  ): Promise<Product> {
    const body = untransformProduct(data)
    const res = await this.clientFor(credentials).post<FlatResource>('products', body)
    return transformProduct(res as unknown as RawOroProduct)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const body = untransformProduct(data)
    const jsonApiBody = body as { data: Record<string, unknown> }
    jsonApiBody.data['id'] = id
    const res = await this.clientFor(credentials).patch<FlatResource>(
      `products/${encodeURIComponent(id)}`,
      jsonApiBody,
    )
    return transformProduct(res as unknown as RawOroProduct)
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
        'OroCommerce requires ?productId= for listVariants; variants are children ' +
          'of a configurable parent product.',
      )
    }
    const client = this.clientFor(credentials)
    // Fetch variant links for this parent product
    const { currentPage, pageSize } = this.pageParams(params)
    const res = await client.listWithPage<FlatResource>(
      'productvariantlinks',
      {
        currentPage,
        pageSize,
        filters: { parentProduct: productId },
      },
    )

    // For each link, fetch the child product
    const variants: ProductVariant[] = []
    for (const link of res.items) {
      const childRels = link['_relationships'] as Record<string, { data?: { id: string } }> | undefined
      const childId = childRels?.['childProduct']?.data?.id ?? (link['childProduct'] as { id: string } | undefined)?.id
      if (childId) {
        try {
          const child = await client.get<FlatResource>(
            `products/${encodeURIComponent(childId)}`,
          )
          variants.push(transformProductVariant(child as unknown as RawOroProduct, productId))
        } catch {
          // Skip variants that can't be fetched
        }
      }
    }
    return variants
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    const client = this.clientFor(credentials)
    const raw = await client.get<FlatResource>(`products/${encodeURIComponent(id)}`)
    // Determine parent from metadata or relationships
    const product = raw as unknown as RawOroProduct
    const parentId = (product._relationships as Record<string, { data?: { id: string } }> | undefined)?.['parentProduct']?.data?.id ?? ''
    return transformProductVariant(product, parentId)
  }

  async createVariant(
    credentials: Credentials,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    const parentId = data.productId
    if (!parentId) {
      throw new Error('OroCommerce createVariant requires productId (parent product id)')
    }
    const client = this.clientFor(credentials)
    // Create the child product first
    const childBody = untransformProductVariant(data)
    const child = await client.post<FlatResource>('products', childBody)
    // Link it to the parent via productvariantlinks
    await client.post('productvariantlinks', {
      data: {
        type: 'productvariantlinks',
        relationships: {
          parentProduct: { data: { type: 'products', id: parentId } },
          childProduct: { data: { type: 'products', id: child.id } },
        },
      },
    })
    return transformProductVariant(child as unknown as RawOroProduct, parentId)
  }

  async updateVariant(
    credentials: Credentials,
    id: string,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    const client = this.clientFor(credentials)
    const body = untransformProductVariant(data)
    const jsonApiBody = body as { data: Record<string, unknown> }
    jsonApiBody.data['id'] = id
    const updated = await client.patch<FlatResource>(
      `products/${encodeURIComponent(id)}`,
      jsonApiBody,
    )
    return transformProductVariant(
      updated as unknown as RawOroProduct,
      data.productId ?? '',
    )
  }

  async deleteVariant(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`products/${encodeURIComponent(id)}`)
  }

  // ── Collections ───────────────────────────────────────────────────────────

  async listCollections(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Collection[]> {
    const { currentPage, pageSize } = this.pageParams(params)
    const res = await this.clientFor(credentials).listWithPage<FlatResource>(
      'mastercatalogcategories',
      { currentPage, pageSize },
    )
    return res.items.map((c) => transformCollection(c as unknown as RawOroCategory))
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const raw = await this.clientFor(credentials).get<FlatResource>(
      `mastercatalogcategories/${encodeURIComponent(id)}`,
    )
    return transformCollection(raw as unknown as RawOroCategory)
  }

  async createCollection(
    credentials: Credentials,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const body = untransformCollection(data)
    const res = await this.clientFor(credentials).post<FlatResource>(
      'mastercatalogcategories',
      body,
    )
    return transformCollection(res as unknown as RawOroCategory)
  }

  async updateCollection(
    credentials: Credentials,
    id: string,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const body = untransformCollection(data)
    const jsonApiBody = body as { data: Record<string, unknown> }
    jsonApiBody.data['id'] = id
    const res = await this.clientFor(credentials).patch<FlatResource>(
      `mastercatalogcategories/${encodeURIComponent(id)}`,
      jsonApiBody,
    )
    return transformCollection(res as unknown as RawOroCategory)
  }

  async deleteCollection(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(
      `mastercatalogcategories/${encodeURIComponent(id)}`,
    )
  }

  // ── Locations ─────────────────────────────────────────────────────────────

  async listLocations(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Location[]> {
    const { currentPage, pageSize } = this.pageParams(params)
    const res = await this.clientFor(credentials).listWithPage<FlatResource>(
      'warehouses',
      { currentPage, pageSize },
    )
    return res.items.map((w) => transformLocation(w as unknown as RawOroWarehouse))
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const raw = await this.clientFor(credentials).get<FlatResource>(
      `warehouses/${encodeURIComponent(id)}`,
    )
    return transformLocation(raw as unknown as RawOroWarehouse)
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    const { currentPage, pageSize } = this.pageParams(params)
    const filters: Record<string, string> = {}
    const productId = (params['productId'] ?? params['product_id'] ?? params['variantId']) as string | undefined
    const warehouseId = (params['warehouseId'] ?? params['locationId']) as string | undefined
    if (productId) filters['product'] = productId
    if (warehouseId) filters['warehouse'] = warehouseId

    const res = await this.clientFor(credentials).listWithPage<FlatResource>(
      'inventorylevels',
      { currentPage, pageSize, filters },
    )
    return res.items.map((il) => transformInventoryLevel(il as unknown as RawOroInventoryLevel))
  }

  async getInventoryLevel(
    credentials: Credentials,
    id: string,
  ): Promise<InventoryLevel> {
    const raw = await this.clientFor(credentials).get<FlatResource>(
      `inventorylevels/${encodeURIComponent(id)}`,
    )
    return transformInventoryLevel(raw as unknown as RawOroInventoryLevel)
  }

  async adjustInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; delta: number },
  ): Promise<InventoryLevel> {
    // Read-modify-write: get current level, then set new value
    const client = this.clientFor(credentials)
    const res = await client.listWithPage<FlatResource>('inventorylevels', {
      pageSize: 1,
      filters: { product: data.variantId, warehouse: data.locationId },
    })
    const current = res.items[0]
    const currentQty = (current as unknown as RawOroInventoryLevel)?.quantity ?? 0
    const newQty = currentQty + data.delta
    const ilId = current?.id

    if (ilId) {
      const updated = await client.patch<FlatResource>(
        `inventorylevels/${encodeURIComponent(ilId)}`,
        {
          data: {
            type: 'inventorylevels',
            id: ilId,
            attributes: { quantity: newQty },
          },
        },
      )
      return transformInventoryLevel(updated as unknown as RawOroInventoryLevel)
    }

    // No existing level found — create one
    return {
      id: `${data.variantId}:${data.locationId}`,
      variantId: data.variantId,
      locationId: data.locationId,
      available: newQty,
      metadata: {
        product: { id: data.variantId },
        warehouse: { id: data.locationId },
        quantity: newQty,
      },
    }
  }

  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    const client = this.clientFor(credentials)
    const res = await client.listWithPage<FlatResource>('inventorylevels', {
      pageSize: 1,
      filters: { product: data.variantId, warehouse: data.locationId },
    })
    const existing = res.items[0]

    if (existing?.id) {
      const updated = await client.patch<FlatResource>(
        `inventorylevels/${encodeURIComponent(existing.id)}`,
        {
          data: {
            type: 'inventorylevels',
            id: existing.id,
            attributes: { quantity: data.available },
          },
        },
      )
      return transformInventoryLevel(updated as unknown as RawOroInventoryLevel)
    }

    return {
      id: `${data.variantId}:${data.locationId}`,
      variantId: data.variantId,
      locationId: data.locationId,
      available: data.available,
      metadata: {
        product: { id: data.variantId },
        warehouse: { id: data.locationId },
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
    const res = await this.clientFor(credentials).listWithPage<FlatResource>(
      'customers',
      { currentPage, pageSize },
    )
    return res.items.map((c) => transformCustomer(c as unknown as RawOroCustomer))
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const raw = await this.clientFor(credentials).get<FlatResource>(
      `customers/${encodeURIComponent(id)}`,
    )
    return transformCustomer(raw as unknown as RawOroCustomer)
  }

  async createCustomer(
    credentials: Credentials,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const body = untransformCustomer(data)
    const res = await this.clientFor(credentials).post<FlatResource>('customers', body)
    return transformCustomer(res as unknown as RawOroCustomer)
  }

  async updateCustomer(
    credentials: Credentials,
    id: string,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const body = untransformCustomer(data)
    const jsonApiBody = body as { data: Record<string, unknown> }
    jsonApiBody.data['id'] = id
    const res = await this.clientFor(credentials).patch<FlatResource>(
      `customers/${encodeURIComponent(id)}`,
      jsonApiBody,
    )
    return transformCustomer(res as unknown as RawOroCustomer)
  }

  async deleteCustomer(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`customers/${encodeURIComponent(id)}`)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const { currentPage, pageSize } = this.pageParams(params)
    const res = await this.clientFor(credentials).listWithPage<FlatResource>(
      'orders',
      { currentPage, pageSize },
    )
    return res.items.map((o) => transformOrder(o as unknown as RawOroOrder))
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const raw = await this.clientFor(credentials).get<FlatResource>(
      `orders/${encodeURIComponent(id)}`,
    )
    return transformOrder(raw as unknown as RawOroOrder)
  }

  async createOrder(
    credentials: Credentials,
    data: Partial<Order>,
  ): Promise<Order> {
    const body = untransformOrder(data)
    const res = await this.clientFor(credentials).post<FlatResource>('orders', body)
    return transformOrder(res as unknown as RawOroOrder)
  }

  async updateOrder(
    credentials: Credentials,
    id: string,
    data: Partial<Order>,
  ): Promise<Order> {
    const body = untransformOrder(data)
    const jsonApiBody = body as { data: Record<string, unknown> }
    jsonApiBody.data['id'] = id
    const res = await this.clientFor(credentials).patch<FlatResource>(
      `orders/${encodeURIComponent(id)}`,
      jsonApiBody,
    )
    return transformOrder(res as unknown as RawOroOrder)
  }

  async cancelOrder(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Order> {
    // Cancel by PATCH-ing the order status to cancelled
    const res = await this.clientFor(credentials).patch<FlatResource>(
      `orders/${encodeURIComponent(id)}`,
      {
        data: {
          type: 'orders',
          id,
          attributes: {
            internalStatus: 'cancelled',
          },
        },
      },
    )
    return transformOrder(res as unknown as RawOroOrder)
  }

  // ── Discounts ─────────────────────────────────────────────────────────────

  async listDiscounts(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Discount[]> {
    const { currentPage, pageSize } = this.pageParams(params)
    const res = await this.clientFor(credentials).listWithPage<FlatResource>(
      'promotions',
      { currentPage, pageSize },
    )
    return res.items.map((p) => transformDiscount(p as unknown as RawOroPromotion))
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const raw = await this.clientFor(credentials).get<FlatResource>(
      `promotions/${encodeURIComponent(id)}`,
    )
    return transformDiscount(raw as unknown as RawOroPromotion)
  }

  async createDiscount(
    credentials: Credentials,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const body = untransformDiscount(data)
    const res = await this.clientFor(credentials).post<FlatResource>('promotions', body)
    return transformDiscount(res as unknown as RawOroPromotion)
  }

  async updateDiscount(
    credentials: Credentials,
    id: string,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const body = untransformDiscount(data)
    const jsonApiBody = body as { data: Record<string, unknown> }
    jsonApiBody.data['id'] = id
    const res = await this.clientFor(credentials).patch<FlatResource>(
      `promotions/${encodeURIComponent(id)}`,
      jsonApiBody,
    )
    return transformDiscount(res as unknown as RawOroPromotion)
  }

  async deleteDiscount(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`promotions/${encodeURIComponent(id)}`)
  }
}
