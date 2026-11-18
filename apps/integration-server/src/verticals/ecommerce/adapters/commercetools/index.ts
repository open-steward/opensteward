/**
 * commercetools adapter for the ecommerce vertical.
 *
 * Maps the commercetools Composable Commerce API to the canonical
 * ecommerce resources. The defining characteristics of commercetools vs.
 * Shopify/WooCommerce that shape this adapter:
 *
 *  1. **Headless, multi-region SaaS.** Every API call is scoped to a
 *     `{projectKey}` embedded in the path and goes to a regional host
 *     (see `constants.ts#REGIONS`). The region lives on
 *     `credentials.extra.region`.
 *
 *  2. **Server-to-server OAuth2 client_credentials grant.** No user-
 *     facing authorize URL, no code exchange. `getAuthUrl` returns a
 *     pointer to the Merchant Center API Clients page for human
 *     onboarding; `exchangeCode` actually requests the bearer token
 *     using credentials the caller supplied via `POST /v1/connections`.
 *     `refreshCredentials` repeats the same grant.
 *
 *  3. **Actions-based updates.** Mutations are NOT `PATCH body` — they
 *     are `POST /resource/{id}` with `{version, actions: []}`. Each
 *     transform file exposes a `buildActionsForXxx(current, updates)`
 *     helper that translates a canonical partial update into the
 *     required action array. `updateXxx` fetches the current resource
 *     (for its version number), builds actions, and POSTs them. On a
 *     409 ConcurrentModification the adapter retries ONCE with the
 *     fresh version to handle routine races.
 *
 *  4. **Webhooks are NOT plain HTTP.** commercetools Subscriptions
 *     deliver to managed queues only (AWS SQS, GCP Pub/Sub, Azure
 *     Service Bus, IronMQ, EventGrid). The adapter therefore omits
 *     `verifyWebhook` / `parseWebhookEvents`.
 *
 *  5. **Locale-keyed content.** Product/category names, descriptions,
 *     and slugs are `{en-US: 'Foo', de-DE: 'Foo DE'}` maps. Transforms
 *     flatten to a single primary locale (`en-US` by default) and
 *     preserve the full map under `metadata.localizedStrings`.
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
import type { Refund } from '../../schema/refund'
import type { Transaction } from '../../schema/transaction'
import type { Discount } from '../../schema/discount'

import { oauth2ClientCredentials } from '@opensteward/shared'
import { requestToken, type CommerceToolsAuthInput } from './auth'
import { CommerceToolsClient } from './client'
import { DEFAULT_PAGE_SIZE, DEFAULT_REGION, REGIONS } from './constants'

const CREDENTIAL_FORM = oauth2ClientCredentials({
  tokenUrl: (input) => {
    const region = (input.region ?? DEFAULT_REGION).trim()
    const r = REGIONS[region]
    if (!r) throw new Error(`Unknown commercetools region: ${region}`)
    return `https://${r.authHost}/oauth/token`
  },
  additionalFields: [
    {
      name: 'region',
      label: 'Region',
      type: 'select',
      options: Object.keys(REGIONS).map((r) => ({ value: r, label: r })),
      required: true,
      helpText: 'Pick the region your commercetools project is hosted in.',
    },
    {
      name: 'projectKey',
      label: 'Project key',
      type: 'text',
      required: true,
      helpText: 'Found in your commercetools merchant center URL.',
    },
  ],
})

import {
  buildActionsForProduct,
  transformProduct,
  untransformProduct,
  type RawCommerceToolsProduct,
  type RawCommerceToolsProductProjection,
  type RawCtProduct,
  type RawCtProductProjection,
} from './transform/product'
import { transformVariant, type RawCtVariant } from './transform/variant'
import {
  buildActionsForCollection,
  transformCollection,
  untransformCollection,
  type RawCtCategory,
} from './transform/collection'
import {
  buildActionsForCustomer,
  transformCustomer,
  untransformCustomer,
  type RawCtCustomer,
} from './transform/customer'
import {
  buildActionsForOrder,
  transformOrder,
  untransformOrder,
  type RawCtOrder,
} from './transform/order'
import { transformFulfillment } from './transform/fulfillment'
import {
  transformPaymentRefunds,
  untransformRefund,
} from './transform/refund'
import {
  transformPayment,
  untransformTransaction,
  type RawCtPayment,
} from './transform/transaction'
import {
  buildActionsForDiscount,
  transformDiscount,
  untransformDiscount,
  type RawCtCartDiscount,
  type RawCtDiscountCode,
} from './transform/discount'
import {
  transformInventoryLevel,
  untransformInventoryLevel,
  type RawCtInventoryEntry,
} from './transform/inventory'
import { transformLocation, type RawCtChannel } from './transform/location'

export interface CommerceToolsAdapterConfig {
  /** commercetools project key. Optional — may come from credentials.extra.projectKey. */
  projectKey?: string
  /** API Client id (server-to-server). */
  clientId?: string
  /** API Client secret. */
  clientSecret?: string
  /** Region slug — see `constants.ts#REGIONS`. */
  region?: string
  /** OAuth2 scopes for the client credentials grant. */
  scopes?: string[]
}

type ProjectionEnvelope = RawCtProductProjection
type ProductEnvelope = RawCtProduct

export class CommerceToolsAdapter implements EcommerceAdapter {
  readonly platform = 'commercetools'
  readonly version = '0.1.0'

  credentialFields = CREDENTIAL_FORM.credentialFields
  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  private configProjectKey: string | undefined
  private configClientId: string | undefined
  private configClientSecret: string | undefined
  private configRegion: string
  private configScopes: string[]

  constructor(config: CommerceToolsAdapterConfig = {}) {
    this.configProjectKey = config.projectKey
    this.configClientId = config.clientId
    this.configClientSecret = config.clientSecret
    this.configRegion = config.region ?? DEFAULT_REGION
    this.configScopes = config.scopes ?? []
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  /**
   * commercetools has no interactive authorize URL for server-to-server
   * access. This method returns a pointer to the Merchant Center API
   * Clients page so the human operator can create an API Client.
   */
  getAuthUrl(_state: string): string {
    const region = this.configRegion
    const project = this.configProjectKey ?? '{projectKey}'
    return `https://mc.${region}.commercetools.com/${project}/settings/developer/api-clients`
  }

  /**
   * Bootstrap credentials from an API Client. Despite the `exchangeCode`
   * name (inherited from the base interface), this adapter expects the
   * caller to POST the raw API Client fields to `/v1/connections`. The
   * middleware wires those fields in via `credentials.extra` so this
   * method never actually sees the `code` argument.
   *
   * For direct invocation, fall back to constructor config.
   */
  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    const input = this.resolveAuthInput()
    return requestToken(input)
  }

  /**
   * Re-issue a Bearer token via the same client_credentials grant. The
   * client secret must be present in `credentials.extra.clientSecret`
   * (it is — we embed it on first token request) so this call can
   * succeed without fresh user input.
   */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    const extra = credentials.extra ?? {}
    const input: CommerceToolsAuthInput = {
      projectKey:
        (extra['projectKey'] as string | undefined) ?? this.configProjectKey ?? '',
      clientId:
        (extra['clientId'] as string | undefined) ?? this.configClientId ?? '',
      clientSecret:
        (extra['clientSecret'] as string | undefined) ?? this.configClientSecret ?? '',
      region: (extra['region'] as string | undefined) ?? this.configRegion,
      scopes:
        (extra['scopes'] as string[] | undefined) ??
        (credentials.scope ? credentials.scope.split(' ') : this.configScopes),
    }
    if (!input.projectKey || !input.clientId || !input.clientSecret) {
      throw new Error(
        'commercetools refreshCredentials: missing projectKey/clientId/clientSecret in credentials.extra',
      )
    }
    return requestToken(input)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private resolveAuthInput(): CommerceToolsAuthInput {
    if (!this.configProjectKey || !this.configClientId || !this.configClientSecret) {
      throw new Error(
        'commercetools adapter is missing projectKey/clientId/clientSecret — ' +
          'configure them under apps/integration-server/config/config.yml adapters.commercetools, or POST ' +
          'them to /v1/connections under credentials.extra {projectKey, clientId, clientSecret, region, scopes}.',
      )
    }
    return {
      projectKey: this.configProjectKey,
      clientId: this.configClientId,
      clientSecret: this.configClientSecret,
      region: this.configRegion,
      scopes: this.configScopes,
    }
  }

  private clientFor(credentials: Credentials): CommerceToolsClient {
    const extra = { ...(credentials.extra ?? {}) }
    if (!extra['projectKey'] && this.configProjectKey) {
      extra['projectKey'] = this.configProjectKey
    }
    if (!extra['region']) {
      extra['region'] = this.configRegion
    }
    if (!credentials.accessToken) {
      throw new Error(
        'commercetools clientFor: credentials.accessToken is required (run exchangeCode first)',
      )
    }
    const merged: Credentials = { ...credentials, extra }
    return new CommerceToolsClient(merged)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
    }
    if (typeof params['offset'] === 'number') {
      out['offset'] = params['offset']
    } else if (typeof params.page === 'number' && params.page > 0) {
      out['offset'] = (params.page - 1) * (params.limit ?? DEFAULT_PAGE_SIZE)
    }
    if (params['where']) out['where'] = params['where']
    if (params['sort']) out['sort'] = params['sort']
    return out
  }

  /**
   * Run an actions-based update with one automatic retry on a 409
   * ConcurrentModification. Re-fetches the current resource to get the
   * fresh version and re-builds the action list.
   */
  private async updateWithActions<T extends { id: string; version: number }>(
    client: CommerceToolsClient,
    path: string,
    current: T,
    buildActions: (fresh: T) => Array<Record<string, unknown>>,
  ): Promise<T> {
    try {
      return await client.post<T>(path, {
        version: current.version,
        actions: buildActions(current),
      })
    } catch (err) {
      const axiosErr = err as { response?: { status?: number } }
      if (axiosErr.response?.status !== 409) throw err
      const fresh = await client.get<T>(path)
      return await client.post<T>(path, {
        version: fresh.version,
        actions: buildActions(fresh),
      })
    }
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const client = this.clientFor(credentials)
    const res = await client.listWithOffset<ProjectionEnvelope>(
      '/product-projections',
      this.listParams(params),
    )
    return res.items.map((p) => transformProduct(p))
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const client = this.clientFor(credentials)
    const res = await client.get<ProjectionEnvelope>(`/product-projections/${id}`)
    return transformProduct(res)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const client = this.clientFor(credentials)
    const res = await client.post<ProductEnvelope>('/products', untransformProduct(data))
    return transformProduct(res)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const client = this.clientFor(credentials)
    const current = await client.get<ProductEnvelope>(`/products/${id}`)
    const updated = await this.updateWithActions<ProductEnvelope>(
      client,
      `/products/${id}`,
      current,
      (fresh) => buildActionsForProduct(fresh, data),
    )
    return transformProduct(updated)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    const client = this.clientFor(credentials)
    const current = await client.get<ProductEnvelope>(`/products/${id}`)
    await client.delete(`/products/${id}`, { version: current.version })
  }

  // ── Variants ──────────────────────────────────────────────────────────────

  async listVariants(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<ProductVariant[]> {
    const productId = params['productId'] ?? params['product_id']
    if (productId == null) {
      throw new Error(
        'commercetools requires ?productId= for listVariants; variants are nested under parent products.',
      )
    }
    const pid = String(productId)
    const client = this.clientFor(credentials)
    const projection = await client.get<ProjectionEnvelope>(`/product-projections/${pid}`)
    const master = transformVariant(projection.masterVariant, pid, 1)
    const rest = (projection.variants ?? []).map((v, idx) =>
      transformVariant(v, pid, idx + 2),
    )
    return [master, ...rest]
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    const [productId, variantIdStr] = id.split(':')
    if (!productId || !variantIdStr) {
      throw new Error('Invalid variant id format: expected `productId:variantId`')
    }
    const variantId = parseInt(variantIdStr, 10)
    const client = this.clientFor(credentials)
    const projection = await client.get<ProjectionEnvelope>(
      `/product-projections/${productId}`,
    )
    const candidates: Array<[RawCtVariant, number]> = [
      [projection.masterVariant, 1],
      ...(projection.variants ?? []).map((v, idx): [RawCtVariant, number] => [v, idx + 2]),
    ]
    const hit = candidates.find(([v]) => v.id === variantId)
    if (!hit) throw new Error(`commercetools variant ${id} not found on product ${productId}`)
    return transformVariant(hit[0], productId, hit[1])
  }

  async createVariant(
    credentials: Credentials,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    if (!data.productId) throw new Error('createVariant requires productId')
    const client = this.clientFor(credentials)
    const current = await client.get<ProductEnvelope>(`/products/${data.productId}`)
    const updated = await this.updateWithActions<ProductEnvelope>(
      client,
      `/products/${data.productId}`,
      current,
      () => [
        {
          action: 'addVariant',
          sku: data.sku,
          key: data.title,
          prices: data.price
            ? [
                {
                  value: {
                    type: 'centPrecision',
                    currencyCode: data.price.currency,
                    centAmount: Math.round(data.price.amount * 100),
                  },
                },
              ]
            : undefined,
          attributes: data.optionValues
            ? Object.entries(data.optionValues).map(([name, value]) => ({ name, value }))
            : undefined,
        },
      ],
    )
    // commercetools returns the full product after addVariant — pull the
    // newly-added variant (highest numeric id) out of the master data.
    const staged = updated.masterData.staged
    const allVariants = [staged.masterVariant, ...(staged.variants ?? [])]
    const newest = allVariants.reduce((a, b) => (a.id > b.id ? a : b))
    return transformVariant(newest, data.productId)
  }

  async updateVariant(
    credentials: Credentials,
    id: string,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    const [productId, variantIdStr] = id.split(':')
    if (!productId || !variantIdStr) {
      throw new Error('Invalid variant id format: expected `productId:variantId`')
    }
    const variantId = parseInt(variantIdStr, 10)
    const client = this.clientFor(credentials)
    const current = await client.get<ProductEnvelope>(`/products/${productId}`)
    const updated = await this.updateWithActions<ProductEnvelope>(
      client,
      `/products/${productId}`,
      current,
      () => {
        const actions: Array<Record<string, unknown>> = []
        if (data.sku !== undefined) {
          actions.push({ action: 'setSku', variantId, sku: data.sku })
        }
        if (data.price !== undefined) {
          actions.push({
            action: 'setPrices',
            variantId,
            prices: [
              {
                value: {
                  type: 'centPrecision',
                  currencyCode: data.price.currency,
                  centAmount: Math.round(data.price.amount * 100),
                },
              },
            ],
          })
        }
        if (data.optionValues) {
          for (const [name, value] of Object.entries(data.optionValues)) {
            actions.push({ action: 'setAttribute', variantId, name, value })
          }
        }
        return actions
      },
    )
    return this.getVariant(credentials, id).catch(() => {
      const staged = updated.masterData.staged
      const all = [staged.masterVariant, ...(staged.variants ?? [])]
      const hit = all.find((v) => v.id === variantId)
      return hit ? transformVariant(hit, productId) : transformVariant(staged.masterVariant, productId)
    })
  }

  async deleteVariant(credentials: Credentials, id: string): Promise<void> {
    const [productId, variantIdStr] = id.split(':')
    if (!productId || !variantIdStr) {
      throw new Error('Invalid variant id format: expected `productId:variantId`')
    }
    const variantId = parseInt(variantIdStr, 10)
    const client = this.clientFor(credentials)
    const current = await client.get<ProductEnvelope>(`/products/${productId}`)
    await this.updateWithActions<ProductEnvelope>(
      client,
      `/products/${productId}`,
      current,
      () => [{ action: 'removeVariant', id: variantId }],
    )
  }

  // ── Collections (commercetools categories) ───────────────────────────────

  async listCollections(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Collection[]> {
    const client = this.clientFor(credentials)
    const res = await client.listWithOffset<RawCtCategory>(
      '/categories',
      this.listParams(params),
    )
    return res.items.map((c) => transformCollection(c))
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const client = this.clientFor(credentials)
    const res = await client.get<RawCtCategory>(`/categories/${id}`)
    return transformCollection(res)
  }

  async createCollection(
    credentials: Credentials,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const client = this.clientFor(credentials)
    const res = await client.post<RawCtCategory>('/categories', untransformCollection(data))
    return transformCollection(res)
  }

  async updateCollection(
    credentials: Credentials,
    id: string,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const client = this.clientFor(credentials)
    const current = await client.get<RawCtCategory & { version: number }>(
      `/categories/${id}`,
    )
    const updated = await this.updateWithActions<RawCtCategory & { version: number }>(
      client,
      `/categories/${id}`,
      current,
      (fresh) => buildActionsForCollection(fresh, data),
    )
    return transformCollection(updated)
  }

  async deleteCollection(credentials: Credentials, id: string): Promise<void> {
    const client = this.clientFor(credentials)
    const current = await client.get<RawCtCategory & { version: number }>(
      `/categories/${id}`,
    )
    await client.delete(`/categories/${id}`, { version: current.version })
  }

  // ── Locations (commercetools channels w/ role InventorySupply) ───────────

  async listLocations(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Location[]> {
    const client = this.clientFor(credentials)
    const res = await client.listWithOffset<RawCtChannel>('/channels', {
      ...this.listParams(params),
      where: 'roles contains "InventorySupply"',
    })
    return res.items
      .filter((c) => c.roles?.includes('InventorySupply'))
      .map((c) => transformLocation(c))
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const client = this.clientFor(credentials)
    const res = await client.get<RawCtChannel>(`/channels/${id}`)
    return transformLocation(res)
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    const client = this.clientFor(credentials)
    const res = await client.listWithOffset<RawCtInventoryEntry>(
      '/inventory',
      this.listParams(params),
    )
    return res.items.map(transformInventoryLevel)
  }

  async getInventoryLevel(
    credentials: Credentials,
    id: string,
  ): Promise<InventoryLevel> {
    const client = this.clientFor(credentials)
    const res = await client.get<RawCtInventoryEntry>(`/inventory/${id}`)
    return transformInventoryLevel(res)
  }

  async adjustInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; delta: number },
  ): Promise<InventoryLevel> {
    const client = this.clientFor(credentials)
    // Locate the inventory entry via sku + supply channel.
    const where =
      data.locationId && data.locationId !== 'default'
        ? `sku="${data.variantId}" and supplyChannel(id="${data.locationId}")`
        : `sku="${data.variantId}" and supplyChannel is not defined`
    const found = await client.listWithOffset<RawCtInventoryEntry & { version: number }>(
      '/inventory',
      { where, limit: 1 },
    )
    const entry = found.items[0]
    if (!entry) {
      // Create a fresh entry with the delta as starting quantity.
      const created = await client.post<RawCtInventoryEntry>('/inventory', {
        ...untransformInventoryLevel({
          variantId: data.variantId,
          locationId: data.locationId,
          available: data.delta,
        }),
      })
      return transformInventoryLevel(created)
    }
    const updated = await this.updateWithActions<
      RawCtInventoryEntry & { version: number }
    >(
      client,
      `/inventory/${entry.id}`,
      entry,
      () => [{ action: 'changeQuantity', quantity: entry.quantityOnStock + data.delta }],
    )
    return transformInventoryLevel(updated)
  }

  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    const client = this.clientFor(credentials)
    const where =
      data.locationId && data.locationId !== 'default'
        ? `sku="${data.variantId}" and supplyChannel(id="${data.locationId}")`
        : `sku="${data.variantId}" and supplyChannel is not defined`
    const found = await client.listWithOffset<RawCtInventoryEntry & { version: number }>(
      '/inventory',
      { where, limit: 1 },
    )
    const entry = found.items[0]
    if (!entry) {
      const created = await client.post<RawCtInventoryEntry>('/inventory', {
        ...untransformInventoryLevel({
          variantId: data.variantId,
          locationId: data.locationId,
          available: data.available,
        }),
      })
      return transformInventoryLevel(created)
    }
    const updated = await this.updateWithActions<
      RawCtInventoryEntry & { version: number }
    >(
      client,
      `/inventory/${entry.id}`,
      entry,
      () => [{ action: 'changeQuantity', quantity: data.available }],
    )
    return transformInventoryLevel(updated)
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const client = this.clientFor(credentials)
    const res = await client.listWithOffset<RawCtCustomer>(
      '/customers',
      this.listParams(params),
    )
    return res.items.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const client = this.clientFor(credentials)
    const res = await client.get<RawCtCustomer>(`/customers/${id}`)
    return transformCustomer(res)
  }

  async createCustomer(
    credentials: Credentials,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const client = this.clientFor(credentials)
    const res = await client.post<{ customer: RawCtCustomer }>(
      '/customers',
      untransformCustomer(data),
    )
    return transformCustomer(res.customer ?? (res as unknown as RawCtCustomer))
  }

  async updateCustomer(
    credentials: Credentials,
    id: string,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const client = this.clientFor(credentials)
    const current = await client.get<RawCtCustomer & { version: number }>(`/customers/${id}`)
    const updated = await this.updateWithActions<RawCtCustomer & { version: number }>(
      client,
      `/customers/${id}`,
      current,
      (fresh) => buildActionsForCustomer(fresh, data),
    )
    return transformCustomer(updated)
  }

  async deleteCustomer(credentials: Credentials, id: string): Promise<void> {
    const client = this.clientFor(credentials)
    const current = await client.get<RawCtCustomer & { version: number }>(`/customers/${id}`)
    await client.delete(`/customers/${id}`, { version: current.version })
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = this.clientFor(credentials)
    const res = await client.listWithOffset<RawCtOrder>(
      '/orders',
      this.listParams(params),
    )
    return res.items.map((o) => transformOrder(o))
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = this.clientFor(credentials)
    const res = await client.get<RawCtOrder>(`/orders/${id}`)
    return transformOrder(res)
  }

  /**
   * commercetools orders are created FROM a Cart. Step 1: POST /carts to
   * produce a cart with the requested line items. Step 2: POST /orders
   * referencing the cart id + version. The canonical API hides both
   * round-trips from the caller.
   */
  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = this.clientFor(credentials)
    const cartDraft = untransformOrder(data)
    const cart = await client.post<{ id: string; version: number }>('/carts', cartDraft)
    const order = await client.post<RawCtOrder>('/orders', {
      cart: { id: cart.id, typeId: 'cart' },
      version: cart.version,
    })
    return transformOrder(order)
  }

  async updateOrder(
    credentials: Credentials,
    id: string,
    data: Partial<Order>,
  ): Promise<Order> {
    const client = this.clientFor(credentials)
    const current = await client.get<RawCtOrder & { version: number }>(`/orders/${id}`)
    const updated = await this.updateWithActions<RawCtOrder & { version: number }>(
      client,
      `/orders/${id}`,
      current,
      (fresh) => buildActionsForOrder(fresh, data),
    )
    return transformOrder(updated)
  }

  async cancelOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = this.clientFor(credentials)
    const current = await client.get<RawCtOrder & { version: number }>(`/orders/${id}`)
    const updated = await this.updateWithActions<RawCtOrder & { version: number }>(
      client,
      `/orders/${id}`,
      current,
      () => [{ action: 'changeOrderState', orderState: 'Cancelled' }],
    )
    return transformOrder(updated)
  }

  // ── Fulfillments (read-only projection of order.shipmentState) ───────────

  async listFulfillments(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Fulfillment[]> {
    const client = this.clientFor(credentials)
    const res = await client.listWithOffset<RawCtOrder>('/orders', {
      ...this.listParams(params),
      where: 'shipmentState is defined',
    })
    return res.items.map(transformFulfillment)
  }

  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    // The canonical fulfillment id == the underlying order id.
    const client = this.clientFor(credentials)
    const order = await client.get<RawCtOrder>(`/orders/${id}`)
    return transformFulfillment(order)
  }

  // ── Refunds (Payment.transactions[type=Refund]) ──────────────────────────

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const orderId = params['order_id'] ?? params['orderId']
    if (orderId == null) {
      throw new Error('commercetools listRefunds requires `order_id` in query params')
    }
    const client = this.clientFor(credentials)
    const order = await client.get<RawCtOrder>(`/orders/${String(orderId)}`)
    const paymentIds = order.paymentInfo?.payments?.map((p) => p.id) ?? []
    const payments = await Promise.all(
      paymentIds.map((pid) => client.get<RawCtPayment>(`/payments/${pid}`)),
    )
    return payments.flatMap((p) => transformPaymentRefunds(p, order.id))
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const [paymentId, transactionId] = id.split(':')
    if (!paymentId || !transactionId) {
      throw new Error('Invalid refund id format: expected `paymentId:transactionId`')
    }
    const client = this.clientFor(credentials)
    const payment = await client.get<RawCtPayment>(`/payments/${paymentId}`)
    const tx = payment.transactions.find(
      (t) => t.id === transactionId && (t.type === 'Refund' || t.type === 'Chargeback'),
    )
    if (!tx) throw new Error(`commercetools refund ${id} not found`)
    // orderId is not discoverable from a payment alone; report empty.
    return transformPaymentRefunds(payment, '')[0] ?? {
      id: `${paymentId}:${transactionId}`,
      orderId: '',
      metadata: { payment, transaction: tx } as unknown as Record<string, unknown>,
    }
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    // The caller must supply the underlying paymentId via metadata.
    const paymentId = data.metadata?.['paymentId'] as string | undefined
    if (!paymentId) {
      throw new Error(
        'commercetools createRefund requires `metadata.paymentId` (the Payment to attach the Refund transaction to)',
      )
    }
    if (!data.orderId) throw new Error('createRefund requires orderId')
    const client = this.clientFor(credentials)
    const current = await client.get<RawCtPayment & { version: number }>(`/payments/${paymentId}`)
    const updated = await this.updateWithActions<RawCtPayment & { version: number }>(
      client,
      `/payments/${paymentId}`,
      current,
      () => [{ action: 'addTransaction', transaction: untransformRefund(data) }],
    )
    const all = transformPaymentRefunds(updated, data.orderId)
    return all[all.length - 1]!
  }

  // ── Transactions (Payment.transactions[]) ────────────────────────────────

  async listTransactions(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Transaction[]> {
    const orderId = params['order_id'] ?? params['orderId']
    if (orderId == null) {
      throw new Error('commercetools listTransactions requires `order_id` in query params')
    }
    const client = this.clientFor(credentials)
    const order = await client.get<RawCtOrder>(`/orders/${String(orderId)}`)
    const paymentIds = order.paymentInfo?.payments?.map((p) => p.id) ?? []
    const payments = await Promise.all(
      paymentIds.map((pid) => client.get<RawCtPayment>(`/payments/${pid}`)),
    )
    return payments.flatMap((p) => transformPayment(p, order.id))
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const [paymentId, transactionId] = id.split(':')
    if (!paymentId || !transactionId) {
      throw new Error('Invalid transaction id format: expected `paymentId:transactionId`')
    }
    const client = this.clientFor(credentials)
    const payment = await client.get<RawCtPayment>(`/payments/${paymentId}`)
    const all = transformPayment(payment)
    const hit = all.find((t) => t.id === `${paymentId}:${transactionId}`)
    if (!hit) throw new Error(`commercetools transaction ${id} not found`)
    return hit
  }

  async createTransaction(
    credentials: Credentials,
    data: Partial<Transaction>,
  ): Promise<Transaction> {
    const paymentId = data.metadata?.['paymentId'] as string | undefined
    if (!paymentId) {
      throw new Error(
        'commercetools createTransaction requires `metadata.paymentId` (the Payment to attach the Transaction to)',
      )
    }
    const client = this.clientFor(credentials)
    const current = await client.get<RawCtPayment & { version: number }>(`/payments/${paymentId}`)
    const updated = await this.updateWithActions<RawCtPayment & { version: number }>(
      client,
      `/payments/${paymentId}`,
      current,
      () => [{ action: 'addTransaction', transaction: untransformTransaction(data) }],
    )
    const all = transformPayment(updated, data.orderId)
    return all[all.length - 1]!
  }

  // ── Discounts (cart-discounts + discount-codes) ──────────────────────────

  async listDiscounts(credentials: Credentials, params: QueryParams): Promise<Discount[]> {
    const client = this.clientFor(credentials)
    const rules = await client.listWithOffset<RawCtCartDiscount>(
      '/cart-discounts',
      this.listParams(params),
    )
    // Pull matching discount-codes in parallel for rules that require one.
    const withCodes = await Promise.all(
      rules.items.map(async (rule) => {
        if (!rule.requiresDiscountCode) return transformDiscount(rule)
        try {
          const codes = await client.listWithOffset<RawCtDiscountCode>('/discount-codes', {
            where: `cartDiscounts(id="${rule.id}")`,
            limit: 1,
          })
          return transformDiscount(rule, codes.items[0])
        } catch {
          return transformDiscount(rule)
        }
      }),
    )
    return withCodes
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const client = this.clientFor(credentials)
    const rule = await client.get<RawCtCartDiscount>(`/cart-discounts/${id}`)
    let code: RawCtDiscountCode | undefined
    if (rule.requiresDiscountCode) {
      try {
        const codes = await client.listWithOffset<RawCtDiscountCode>('/discount-codes', {
          where: `cartDiscounts(id="${id}")`,
          limit: 1,
        })
        code = codes.items[0]
      } catch {
        /* best-effort */
      }
    }
    return transformDiscount(rule, code)
  }

  async createDiscount(
    credentials: Credentials,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const client = this.clientFor(credentials)
    const rule = await client.post<RawCtCartDiscount & { version: number }>(
      '/cart-discounts',
      untransformDiscount(data),
    )
    let code: RawCtDiscountCode | undefined
    if (data.code) {
      code = await client.post<RawCtDiscountCode>('/discount-codes', {
        code: data.code,
        cartDiscounts: [{ typeId: 'cart-discount', id: rule.id }],
        isActive: true,
      })
    }
    return transformDiscount(rule, code)
  }

  async updateDiscount(
    credentials: Credentials,
    id: string,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const client = this.clientFor(credentials)
    const current = await client.get<RawCtCartDiscount & { version: number }>(
      `/cart-discounts/${id}`,
    )
    const updated = await this.updateWithActions<RawCtCartDiscount & { version: number }>(
      client,
      `/cart-discounts/${id}`,
      current,
      (fresh) => buildActionsForDiscount(fresh, data),
    )
    return transformDiscount(updated)
  }

  async deleteDiscount(credentials: Credentials, id: string): Promise<void> {
    const client = this.clientFor(credentials)
    // Delete any attached discount-codes first so the cart-discount delete
    // doesn't fail on dangling references.
    try {
      const codes = await client.listWithOffset<RawCtDiscountCode & { version: number }>(
        '/discount-codes',
        { where: `cartDiscounts(id="${id}")`, limit: 50 },
      )
      for (const code of codes.items) {
        await client.delete(`/discount-codes/${code.id}`, { version: code.version })
      }
    } catch {
      /* best-effort */
    }
    const current = await client.get<RawCtCartDiscount & { version: number }>(
      `/cart-discounts/${id}`,
    )
    await client.delete(`/cart-discounts/${id}`, { version: current.version })
  }
}

// Re-exports so consumers can import raw shapes too.
export type {
  RawCommerceToolsProduct,
  RawCommerceToolsProductProjection,
}
