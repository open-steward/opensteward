/**
 * ikas adapter for the ecommerce vertical.
 *
 * ikas is a Turkish e-commerce platform that exposes a GraphQL API at
 * https://api.myikas.com/api/v2/admin/graphql. Authentication uses the
 * OAuth2 client_credentials flow — access tokens expire after 4 hours and
 * are automatically refreshed via `refreshCredentials`.
 *
 * Supported resources: Products, Variants (via Products), Collections
 * (Categories), Customers, Orders, Fulfillments (OrderPackages), Refunds,
 * Discounts (Campaigns), Inventory (via variant stocks).
 *
 * Not supported (auto-501): Transactions (no standalone API), Locations
 * (stock locations are not publicly listable as a top-level resource in v2).
 *
 * Docs: https://ikas.dev/docs/intro
 */

import type { Credentials, QueryParams } from '@opensteward/shared'
import { oauth2ClientCredentials } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product, ProductVariant } from '../../schema/product'
import type { Collection } from '../../schema/collection'
import type { InventoryLevel } from '../../schema/inventory'
import type { Customer } from '../../schema/customer'
import type { Order } from '../../schema/order'
import type { Fulfillment } from '../../schema/fulfillment'
import type { Refund } from '../../schema/refund'
import type { Discount } from '../../schema/discount'
import type { WebhookEvent } from '../../schema/webhook'

import { fetchAccessToken } from './auth'
import { IkasClient, defaultPagination } from './client'
import { DEFAULT_SCOPES, normaliseStoreName, tokenEndpoint } from './constants'
import { parseIkasWebhookEvents } from './webhook'

import {
  transformProduct,
  untransformProduct,
  transformVariant,
  untransformVariant,
  type RawIkasProduct,
  type RawIkasVariant,
} from './transform/product'
import {
  transformCollection,
  untransformCollection,
  type RawIkasCategory,
} from './transform/collection'
import {
  transformCustomer,
  untransformCustomer,
  type RawIkasCustomer,
} from './transform/customer'
import {
  transformOrder,
  untransformOrder,
  type RawIkasOrder,
} from './transform/order'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawIkasOrderPackage,
} from './transform/fulfillment'
import { transformRefund, untransformRefund, type RawIkasRefund } from './transform/refund'
import { transformDiscount, untransformDiscount, type RawIkasCampaign } from './transform/discount'
import { transformInventoryLevel, type RawIkasVariantStock } from './transform/inventory'

// ── GraphQL query documents ───────────────────────────────────────────────────

const LIST_PRODUCTS_QUERY = `
  query ListProducts($pagination: PaginationInput) {
    listProduct(pagination: $pagination) {
      data {
        id name description isActive tags
        brand { id name }
        categories { id name }
        variants {
          id sku barcodeList weight isActive
          prices { sellPrice discountPrice currency priceListId }
          stocks { stockCount stockLocationId }
          variantValues { variantTypeId variantTypeName variantValueId variantValueName }
        }
        createdAt updatedAt
      }
      count hasNext
    }
  }
`

const GET_PRODUCT_QUERY = `
  query GetProduct($id: StringFilterInput) {
    listProduct(id: $id) {
      data {
        id name description isActive tags
        brand { id name }
        categories { id name }
        variants {
          id sku barcodeList weight isActive
          prices { sellPrice discountPrice currency priceListId }
          stocks { stockCount stockLocationId }
          variantValues { variantTypeId variantTypeName variantValueId variantValueName }
        }
        createdAt updatedAt
      }
    }
  }
`

const SAVE_PRODUCT_MUTATION = `
  mutation SaveProduct($input: ProductInput!) {
    saveProduct(input: $input) {
      id name description isActive tags
      brand { id name }
      categories { id name }
      variants {
        id sku barcodeList weight isActive
        prices { sellPrice discountPrice currency priceListId }
        stocks { stockCount stockLocationId }
        variantValues { variantTypeId variantTypeName variantValueId variantValueName }
      }
      createdAt updatedAt
    }
  }
`

const DELETE_PRODUCT_MUTATION = `
  mutation DeleteProductList($idList: [String!]!) {
    deleteProductList(idList: $idList)
  }
`

const LIST_CATEGORIES_QUERY = `
  query ListCategories($pagination: PaginationInput) {
    listCategory(pagination: $pagination) {
      data {
        id name description isActive parentId createdAt updatedAt
      }
      count hasNext
    }
  }
`

const LIST_CUSTOMERS_QUERY = `
  query ListCustomers($pagination: PaginationInput) {
    listCustomer(pagination: $pagination) {
      data {
        id email firstName lastName phone orderCount totalOrderPrice
        subscriptionStatus tagIds
        addresses {
          addressLine1 addressLine2 postalCode isDefault
          city { name code }
          state { name code }
          country { name code iso2 iso3 }
        }
        createdAt updatedAt
      }
      count hasNext
    }
  }
`

const GET_CUSTOMER_QUERY = `
  query GetCustomer($id: StringFilterInput) {
    listCustomer(id: $id) {
      data {
        id email firstName lastName phone orderCount totalOrderPrice
        subscriptionStatus tagIds
        addresses {
          addressLine1 addressLine2 postalCode isDefault
          city { name code }
          state { name code }
          country { name code iso2 iso3 }
        }
        createdAt updatedAt
      }
    }
  }
`

const LIST_ORDERS_QUERY = `
  query ListOrders($pagination: PaginationInput) {
    listOrder(pagination: $pagination) {
      data {
        id orderNumber currencyCode
        totalFinalPrice totalPrice totalTax totalDiscount shippingCost
        orderPaymentStatus status cancelReason
        customer { id email phone firstName lastName }
        orderLineItems {
          id productId variantId productName quantity finalPrice price discount sku
        }
        orderPackages { id status }
        billingAddress {
          addressLine1 addressLine2 postalCode
          city { name } state { name } country { name code iso2 }
        }
        shippingAddress {
          addressLine1 addressLine2 postalCode
          city { name } state { name } country { name code iso2 }
        }
        orderedAt createdAt updatedAt
      }
      count hasNext
    }
  }
`

const GET_ORDER_QUERY = `
  query GetOrder($id: StringFilterInput) {
    listOrder(id: $id) {
      data {
        id orderNumber currencyCode
        totalFinalPrice totalPrice totalTax totalDiscount shippingCost
        orderPaymentStatus status cancelReason
        customer { id email phone firstName lastName }
        orderLineItems {
          id productId variantId productName quantity finalPrice price discount sku
        }
        orderPackages {
          id orderId status
          trackingInfo { trackingNumber trackingUrl shippingCompany }
          lines { orderLineItemId quantity }
          stockLocationId createdAt updatedAt
        }
        billingAddress {
          addressLine1 addressLine2 postalCode
          city { name } state { name } country { name code iso2 }
        }
        shippingAddress {
          addressLine1 addressLine2 postalCode
          city { name } state { name } country { name code iso2 }
        }
        orderedAt createdAt updatedAt
      }
    }
  }
`

const CREATE_ORDER_MUTATION = `
  mutation CreateOrderWithTransactions($input: CreateOrderWithTransactionsInput!) {
    createOrderWithTransactions(input: $input) {
      id orderNumber currencyCode totalFinalPrice orderPaymentStatus status
      customer { id email }
      orderLineItems { id productId variantId productName quantity finalPrice }
      orderedAt createdAt updatedAt
    }
  }
`

const CANCEL_ORDER_MUTATION = `
  mutation UpdateOrderLine($input: UpdateOrderInput!) {
    updateOrderLine(input: $input) {
      id orderNumber status cancelReason updatedAt
    }
  }
`

const FULFILL_ORDER_MUTATION = `
  mutation FulfillOrder($orderId: String!, $lines: [FulfillOrderLineInput!]!, $trackingInfoDetail: TrackingInfoDetailInput) {
    fulfillOrder(orderId: $orderId, lines: $lines, trackingInfoDetail: $trackingInfoDetail) {
      id orderNumber status
      orderPackages {
        id orderId status
        trackingInfo { trackingNumber trackingUrl shippingCompany }
        lines { orderLineItemId quantity }
        stockLocationId createdAt updatedAt
      }
    }
  }
`

const UPDATE_PACKAGE_STATUS_MUTATION = `
  mutation UpdateOrderPackageStatus($orderId: String!, $packages: [UpdateOrderPackageInput!]!) {
    updateOrderPackageStatus(orderId: $orderId, packages: $packages) {
      id orderNumber status
      orderPackages {
        id orderId status
        trackingInfo { trackingNumber trackingUrl shippingCompany }
        createdAt updatedAt
      }
    }
  }
`

const REFUND_ORDER_MUTATION = `
  mutation RefundOrderLine($input: OrderRefundInput!) {
    refundOrderLine(input: $input) {
      id orderNumber status totalFinalPrice updatedAt
    }
  }
`

const LIST_CAMPAIGNS_QUERY = `
  query ListCampaigns($pagination: PaginationInput) {
    listCampaign(pagination: $pagination) {
      data {
        id title couponCode discountType discountValue
        minimumOrderAmount usageLimit usageCount
        appliesTo productIds categoryIds
        startsAt endsAt isActive createdAt
      }
      count hasNext
    }
  }
`

const GET_CAMPAIGN_QUERY = `
  query GetCampaign($id: StringFilterInput) {
    listCampaign(id: $id) {
      data {
        id title couponCode discountType discountValue
        minimumOrderAmount usageLimit usageCount
        appliesTo productIds categoryIds
        startsAt endsAt isActive createdAt
      }
    }
  }
`

const SAVE_CAMPAIGN_MUTATION = `
  mutation SaveCampaign($input: CampaignInput!) {
    saveCampaign(input: $input) {
      id title couponCode discountType discountValue
      minimumOrderAmount usageLimit usageCount
      appliesTo productIds categoryIds
      startsAt endsAt isActive createdAt
    }
  }
`

// ── Credential form (Connect Link) ────────────────────────────────────────────

/**
 * A Private App is created by the merchant in their own ikas admin and yields
 * a client id + secret; the token endpoint sits on the store's own host
 * (https://ikas.dev/docs/api/getting-started/authentication). So all three
 * values are per-connection, and the store name is kept on `extra` for refresh.
 */
const CRED_FORM = oauth2ClientCredentials({
  tokenUrl: (input) => tokenEndpoint(input['storeName'] ?? ''),
  additionalFields: [
    {
      name: 'storeName',
      label: 'Store name',
      type: 'text',
      required: true,
      placeholder: 'mystore',
      helpText: 'The subdomain of your ikas admin — "mystore" for https://mystore.myikas.com/admin.',
    },
  ],
  buildExtra: (input) => ({
    clientId: (input['clientId'] ?? '').trim(),
    clientSecret: input['clientSecret'] ?? '',
    storeName: normaliseStoreName(input['storeName']),
  }),
})

// ── Adapter config ────────────────────────────────────────────────────────────

export interface IkasAdapterConfig {
  /** Fallback Private App client id; per-connection values from the Connect Link form win. */
  clientId?: string
  /** Fallback Private App client secret. */
  clientSecret?: string
  /** Fallback store name (subdomain of `<store>.myikas.com`). */
  storeName?: string
  /** Requested OAuth scopes. Defaults to DEFAULT_SCOPES if not specified. */
  scopes?: string[]
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class IkasAdapter implements EcommerceAdapter {
  readonly platform = 'ikas'
  readonly version = '0.1.0'

  // Connect Link support
  credentialFields = CRED_FORM.credentialFields
  exchangeCredentials = CRED_FORM.exchangeCredentials

  private clientId: string | undefined
  private clientSecret: string | undefined
  private storeName: string | undefined
  private scopes: string[]

  constructor(config: IkasAdapterConfig = {}) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.storeName = config.storeName
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  /**
   * ikas uses client_credentials — there is no per-user authorization URL.
   * Return an informational URL pointing to the ikas partner dashboard.
   */
  getAuthUrl(_state: string): string {
    return 'https://ikas.com/app-store/private-apps'
  }

  /**
   * ikas does not use an authorization-code flow. Throws a descriptive error
   * so callers fail loudly rather than silently ignoring a missing flow.
   */
  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error(
      'ikas uses OAuth2 client_credentials, not authorization-code. ' +
        'Connect it through the Connect Link form (store name, client id, client secret) ' +
        'and the adapter will fetch the access token automatically.',
    )
  }

  /**
   * Re-fetch an access token using the stored client credentials. Called
   * automatically when `isTokenExpired` returns true (token lifetime: 4 h).
   */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    const cid = (credentials.extra?.['clientId'] as string | undefined) ?? this.clientId
    const csec = (credentials.extra?.['clientSecret'] as string | undefined) ?? this.clientSecret
    const store = (credentials.extra?.['storeName'] as string | undefined) ?? this.storeName
    if (!cid || !csec || !store) {
      return credentials
    }
    const fresh = await fetchAccessToken(store, cid, csec)
    return {
      ...fresh,
      extra: credentials.extra,
    }
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────

  /**
   * ikas does not document a webhook signature scheme in its public docs.
   * Always returns true — callers should rely on network-level security
   * (IP allowlist, TLS client certs) for delivery validation.
   */
  verifyWebhook(_payload: Buffer, _headers: Record<string, string>, _secret: string): boolean {
    return true
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    const scope =
      (payload['scope'] as string | undefined) ??
      (payload['__scope'] as string | undefined)
    return parseIkasWebhookEvents(payload, scope)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private client(credentials: Credentials): IkasClient {
    return new IkasClient(credentials)
  }

  private pagination(params: QueryParams) {
    return defaultPagination({
      limit: params.limit,
      page: params['page'] as number | undefined,
    })
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.client(credentials).listWithPage<RawIkasProduct>(
      LIST_PRODUCTS_QUERY,
      'listProduct',
      this.pagination(params),
    )
    return res.items.map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.client(credentials).gql<{ listProduct: { data: RawIkasProduct[] } }>(
      GET_PRODUCT_QUERY,
      { id: { eq: id } },
    )
    const product = res.listProduct.data[0]
    if (!product) throw new Error(`ikas: product '${id}' not found`)
    return transformProduct(product)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const raw = await this.client(credentials).mutate<RawIkasProduct>(
      SAVE_PRODUCT_MUTATION,
      'saveProduct',
      { input: untransformProduct(data) },
    )
    return transformProduct(raw)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const raw = await this.client(credentials).mutate<RawIkasProduct>(
      SAVE_PRODUCT_MUTATION,
      'saveProduct',
      { input: { id, ...untransformProduct(data) } },
    )
    return transformProduct(raw)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).gql(DELETE_PRODUCT_MUTATION, { idList: [id] })
  }

  // ── Variants ──────────────────────────────────────────────────────────────

  async listVariants(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<ProductVariant[]> {
    const productId = (params['productId'] ?? params['product_id']) as string | undefined
    if (productId) {
      // Fetch a single product and return its variants.
      const res = await this.client(credentials).gql<{ listProduct: { data: RawIkasProduct[] } }>(
        GET_PRODUCT_QUERY,
        { id: { eq: productId } },
      )
      const product = res.listProduct.data[0]
      if (!product) return []
      return (product.variants ?? []).map((v) => transformVariant(v, product.id))
    }
    // Fallback: fetch products and flatten variants.
    const products = await this.client(credentials).listWithPage<RawIkasProduct>(
      LIST_PRODUCTS_QUERY,
      'listProduct',
      this.pagination(params),
    )
    return products.items.flatMap((p) =>
      (p.variants ?? []).map((v) => transformVariant(v, p.id)),
    )
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    // ikas does not expose a getVariant endpoint; scan recent products.
    // Composite id format: `productId:variantId`
    const [productId, variantId] = id.split(':')
    if (!productId || !variantId) {
      throw new Error('ikas getVariant requires composite id `productId:variantId`')
    }
    const res = await this.client(credentials).gql<{ listProduct: { data: RawIkasProduct[] } }>(
      GET_PRODUCT_QUERY,
      { id: { eq: productId } },
    )
    const product = res.listProduct.data[0]
    if (!product) throw new Error(`ikas: product '${productId}' not found`)
    const variant = (product.variants ?? []).find((v: RawIkasVariant) => v.id === variantId)
    if (!variant) throw new Error(`ikas: variant '${variantId}' not found on product '${productId}'`)
    return transformVariant(variant, product.id)
  }

  async updateVariant(
    credentials: Credentials,
    id: string,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    const [productId, variantId] = id.split(':')
    if (!productId || !variantId) {
      throw new Error('ikas updateVariant requires composite id `productId:variantId`')
    }
    const raw = await this.client(credentials).mutate<RawIkasProduct>(
      SAVE_PRODUCT_MUTATION,
      'saveProduct',
      {
        input: {
          id: productId,
          variants: [{ id: variantId, ...untransformVariant(data) }],
        },
      },
    )
    const updated = (raw.variants ?? []).find((v: RawIkasVariant) => v.id === variantId)
    if (!updated) throw new Error(`ikas: updated variant '${variantId}' not found in response`)
    return transformVariant(updated, productId)
  }

  // ── Collections (Categories) ──────────────────────────────────────────────

  async listCollections(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Collection[]> {
    const res = await this.client(credentials).listWithPage<RawIkasCategory>(
      LIST_CATEGORIES_QUERY,
      'listCategory',
      this.pagination(params),
    )
    return res.items.map(transformCollection)
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    // Filter by id via the list query
    const res = await this.client(credentials).gql<{ listCategory: { data: RawIkasCategory[] } }>(
      `query GetCategory($id: StringFilterInput) {
        listCategory(id: $id) {
          data { id name description isActive parentId createdAt updatedAt }
        }
      }`,
      { id: { eq: id } },
    )
    const cat = res.listCategory.data[0]
    if (!cat) throw new Error(`ikas: category '${id}' not found`)
    return transformCollection(cat)
  }

  async createCollection(
    credentials: Credentials,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const raw = await this.client(credentials).mutate<RawIkasCategory>(
      `mutation SaveCategory($input: CategoryInput!) {
        saveCategory(input: $input) {
          id name description isActive createdAt updatedAt
        }
      }`,
      'saveCategory',
      { input: untransformCollection(data) },
    )
    return transformCollection(raw)
  }

  async updateCollection(
    credentials: Credentials,
    id: string,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const raw = await this.client(credentials).mutate<RawIkasCategory>(
      `mutation SaveCategory($input: CategoryInput!) {
        saveCategory(input: $input) {
          id name description isActive createdAt updatedAt
        }
      }`,
      'saveCategory',
      { input: { id, ...untransformCollection(data) } },
    )
    return transformCollection(raw)
  }

  async deleteCollection(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).gql(
      `mutation DeleteCategory($idList: [String!]!) {
        deleteCategoryList(idList: $idList)
      }`,
      { idList: [id] },
    )
  }

  // ── Inventory (via variant stocks) ────────────────────────────────────────

  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    const variantId = (params['variantId'] ?? params['variant_id']) as string | undefined
    const productId = (params['productId'] ?? params['product_id']) as string | undefined

    // Fetch the product(s) and flatten variant stocks.
    const res = await this.client(credentials).listWithPage<RawIkasProduct>(
      LIST_PRODUCTS_QUERY,
      'listProduct',
      this.pagination(params),
      productId ? { id: { eq: productId } } : {},
    )

    const levels: InventoryLevel[] = []
    for (const product of res.items) {
      for (const variant of product.variants ?? []) {
        if (variantId && variant.id !== variantId) continue
        for (const stock of (variant.stocks as RawIkasVariantStock[] | undefined) ?? []) {
          levels.push(transformInventoryLevel(stock, variant.id))
        }
      }
    }
    return levels
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const res = await this.client(credentials).listWithPage<RawIkasCustomer>(
      LIST_CUSTOMERS_QUERY,
      'listCustomer',
      this.pagination(params),
    )
    return res.items.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const res = await this.client(credentials).gql<{ listCustomer: { data: RawIkasCustomer[] } }>(
      GET_CUSTOMER_QUERY,
      { id: { eq: id } },
    )
    const customer = res.listCustomer.data[0]
    if (!customer) throw new Error(`ikas: customer '${id}' not found`)
    return transformCustomer(customer)
  }

  async createCustomer(
    credentials: Credentials,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const raw = await this.client(credentials).mutate<RawIkasCustomer>(
      `mutation SaveCustomer($input: CustomerInput!) {
        saveCustomer(input: $input) {
          id email firstName lastName phone orderCount totalOrderPrice
          subscriptionStatus
          addresses {
            addressLine1 addressLine2 postalCode isDefault
            city { name } state { name } country { name iso2 }
          }
          createdAt updatedAt
        }
      }`,
      'saveCustomer',
      { input: untransformCustomer(data) },
    )
    return transformCustomer(raw)
  }

  async updateCustomer(
    credentials: Credentials,
    id: string,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const raw = await this.client(credentials).mutate<RawIkasCustomer>(
      `mutation SaveCustomer($input: CustomerInput!) {
        saveCustomer(input: $input) {
          id email firstName lastName phone orderCount totalOrderPrice
          subscriptionStatus
          addresses {
            addressLine1 addressLine2 postalCode isDefault
            city { name } state { name } country { name iso2 }
          }
          createdAt updatedAt
        }
      }`,
      'saveCustomer',
      { input: { id, ...untransformCustomer(data) } },
    )
    return transformCustomer(raw)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const res = await this.client(credentials).listWithPage<RawIkasOrder>(
      LIST_ORDERS_QUERY,
      'listOrder',
      this.pagination(params),
    )
    return res.items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const res = await this.client(credentials).gql<{ listOrder: { data: RawIkasOrder[] } }>(
      GET_ORDER_QUERY,
      { id: { eq: id } },
    )
    const order = res.listOrder.data[0]
    if (!order) throw new Error(`ikas: order '${id}' not found`)
    return transformOrder(order)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const raw = await this.client(credentials).mutate<RawIkasOrder>(
      CREATE_ORDER_MUTATION,
      'createOrderWithTransactions',
      { input: untransformOrder(data) },
    )
    return transformOrder(raw)
  }

  async cancelOrder(
    credentials: Credentials,
    id: string,
    data?: { reason?: string },
  ): Promise<Order> {
    const raw = await this.client(credentials).mutate<RawIkasOrder>(
      CANCEL_ORDER_MUTATION,
      'updateOrderLine',
      {
        input: {
          orderId: id,
          status: 'CANCELLED',
          cancelReason: data?.reason,
        },
      },
    )
    return transformOrder(raw)
  }

  // ── Fulfillments (OrderPackages) ──────────────────────────────────────────

  async listFulfillments(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Fulfillment[]> {
    const orderId = (params['order_id'] ?? params['orderId']) as string | undefined
    if (!orderId) throw new Error('ikas listFulfillments requires `order_id` in query params')
    const res = await this.client(credentials).gql<{ listOrder: { data: RawIkasOrder[] } }>(
      GET_ORDER_QUERY,
      { id: { eq: orderId } },
    )
    const order = res.listOrder.data[0]
    if (!order) throw new Error(`ikas: order '${orderId}' not found`)
    return (order.orderPackages as RawIkasOrderPackage[] | undefined ?? []).map((pkg) =>
      transformFulfillment(pkg, orderId),
    )
  }

  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    // Composite id: `orderId:packageId`
    const [orderId, packageId] = id.split(':')
    if (!orderId || !packageId) {
      throw new Error('ikas getFulfillment requires composite id `orderId:packageId`')
    }
    const res = await this.client(credentials).gql<{ listOrder: { data: RawIkasOrder[] } }>(
      GET_ORDER_QUERY,
      { id: { eq: orderId } },
    )
    const order = res.listOrder.data[0]
    if (!order) throw new Error(`ikas: order '${orderId}' not found`)
    const pkg = (order.orderPackages as RawIkasOrderPackage[] | undefined ?? []).find(
      (p) => p.id === packageId,
    )
    if (!pkg) throw new Error(`ikas: package '${packageId}' not found on order '${orderId}'`)
    return transformFulfillment(pkg, orderId)
  }

  async createFulfillment(
    credentials: Credentials,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    if (!data.orderId) throw new Error('ikas createFulfillment requires orderId')
    const lines = (data.lineItems ?? []).map((li) => ({
      orderLineItemId: li.lineItemId,
      quantity: li.quantity,
    }))
    const raw = await this.client(credentials).mutate<RawIkasOrder>(
      FULFILL_ORDER_MUTATION,
      'fulfillOrder',
      {
        orderId: data.orderId,
        lines,
        trackingInfoDetail: data.trackingNumber
          ? {
              trackingNumber: data.trackingNumber,
              trackingUrl: data.trackingUrl,
              shippingCompany: data.carrier,
            }
          : undefined,
      },
    )
    const pkg = (raw.orderPackages as RawIkasOrderPackage[] | undefined ?? [])[0]
    if (!pkg) throw new Error('ikas: fulfillOrder returned no package')
    return transformFulfillment(pkg, data.orderId)
  }

  async updateFulfillment(
    credentials: Credentials,
    id: string,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    const [orderId, packageId] = id.split(':')
    if (!orderId || !packageId) {
      throw new Error('ikas updateFulfillment requires composite id `orderId:packageId`')
    }
    const { trackingNumber, trackingUrl, carrier } = data
    const raw = await this.client(credentials).mutate<RawIkasOrder>(
      UPDATE_PACKAGE_STATUS_MUTATION,
      'updateOrderPackageStatus',
      {
        orderId,
        packages: [
          {
            packageId,
            trackingInfo: trackingNumber
              ? { trackingNumber, trackingUrl, shippingCompany: carrier }
              : undefined,
          },
        ],
      },
    )
    const pkg = (raw.orderPackages as RawIkasOrderPackage[] | undefined ?? []).find(
      (p) => p.id === packageId,
    )
    const fallbackPkg: RawIkasOrderPackage = pkg ?? {
      id: packageId,
      orderId,
      ...untransformFulfillment(data),
    }
    return transformFulfillment(fallbackPkg, orderId)
  }

  async cancelFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    const [orderId, packageId] = id.split(':')
    if (!orderId || !packageId) {
      throw new Error('ikas cancelFulfillment requires composite id `orderId:packageId`')
    }
    const raw = await this.client(credentials).mutate<RawIkasOrder>(
      UPDATE_PACKAGE_STATUS_MUTATION,
      'updateOrderPackageStatus',
      {
        orderId,
        packages: [{ packageId, status: 'CANCELLED' }],
      },
    )
    const pkg = (raw.orderPackages as RawIkasOrderPackage[] | undefined ?? []).find(
      (p) => p.id === packageId,
    ) ?? { id: packageId, orderId, status: 'CANCELLED' }
    return transformFulfillment(pkg as RawIkasOrderPackage, orderId)
  }

  // ── Refunds ───────────────────────────────────────────────────────────────

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.orderId) throw new Error('ikas createRefund requires orderId')
    const raw = await this.client(credentials).mutate<RawIkasOrder>(
      REFUND_ORDER_MUTATION,
      'refundOrderLine',
      { input: untransformRefund(data) },
    )
    // ikas refundOrderLine returns the updated order; synthesise a Refund from it.
    const refund: RawIkasRefund = {
      id: `refund:${data.orderId}:${Date.now()}`,
      orderId: data.orderId,
      refundLineItems: data.refundLineItems?.map((li) => ({
        orderLineItemId: li.lineItemId,
        quantity: li.quantity,
      })),
      note: data.note,
      currency: raw.currencyCode ?? undefined,
      createdAt: raw.updatedAt ?? new Date().toISOString(),
    }
    return transformRefund(refund)
  }

  // ── Discounts (Campaigns) ─────────────────────────────────────────────────

  async listDiscounts(credentials: Credentials, params: QueryParams): Promise<Discount[]> {
    const res = await this.client(credentials).listWithPage<RawIkasCampaign>(
      LIST_CAMPAIGNS_QUERY,
      'listCampaign',
      this.pagination(params),
    )
    return res.items.map(transformDiscount)
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const res = await this.client(credentials).gql<{ listCampaign: { data: RawIkasCampaign[] } }>(
      GET_CAMPAIGN_QUERY,
      { id: { eq: id } },
    )
    const campaign = res.listCampaign.data[0]
    if (!campaign) throw new Error(`ikas: campaign '${id}' not found`)
    return transformDiscount(campaign)
  }

  async createDiscount(
    credentials: Credentials,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const raw = await this.client(credentials).mutate<RawIkasCampaign>(
      SAVE_CAMPAIGN_MUTATION,
      'saveCampaign',
      { input: untransformDiscount(data) },
    )
    return transformDiscount(raw)
  }

  async updateDiscount(
    credentials: Credentials,
    id: string,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const raw = await this.client(credentials).mutate<RawIkasCampaign>(
      SAVE_CAMPAIGN_MUTATION,
      'saveCampaign',
      { input: { id, ...untransformDiscount(data) } },
    )
    return transformDiscount(raw)
  }

  async deleteDiscount(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).gql(
      `mutation DeleteCampaign($idList: [String!]!) {
        deleteCampaignList(idList: $idList)
      }`,
      { idList: [id] },
    )
  }
}
