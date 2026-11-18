/**
 * Sana Commerce adapter for the ecommerce vertical.
 *
 * Maps the Sana Commerce web service API (`{siteUrl}/api/CommerceService.svc`)
 * to the canonical ecommerce resources.
 *
 * Supported resources:
 *  - Products   (catalog/product, catalog/productsbyloadoptions)
 *  - Variants   (nested units on product; flattened via listVariants)
 *  - Collections (catalog/productcategories — Sana calls them categories)
 *  - Customers  (customer/search)
 *  - Orders     (order/pendingorders, order/details, order/placeorder)
 *
 * Not supported (return 501 via missing method convention):
 *  Fulfillments, Transactions, Refunds, Discounts, Inventory, Locations.
 *  Sana Commerce derives inventory and pricing directly from the connected
 *  ERP system and does not expose standalone ledger endpoints.
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: discount     — No discount/promotion endpoint in the web service API; discounts are applied server-side by the ERP during basket calculation.
 * Unavailable: fulfillment  — No fulfillment endpoint; fulfillment state is managed entirely by the connected ERP.
 * Unavailable: inventory    — Inventory levels live in the ERP; no stock endpoint exists in CommerceService.svc.
 * Unavailable: location     — No warehouse/location endpoint; physical location data resides in the ERP.
 * Unavailable: refund       — No refund/return-order endpoint; returns are written directly to the ERP.
 * Unavailable: transaction  — No payment transaction endpoint; payment state is handled via Sana Pay/ERP integrations.
 *
 * Auth: api_key model. Credentials supplied as:
 *  - `credentials.accessToken`       — service-account password
 *  - `credentials.extra.siteUrl`     — storefront base URL (e.g. https://store.example.com)
 *  - `credentials.extra.username`    — service-account username
 *  - `credentials.extra.languageId`  — optional Windows language code for response language
 *  - `credentials.extra.currencyId`  — optional ISO 4217 code to lock pricing currency
 *
 * Docs:
 *  https://help.sana-commerce.com/sana-commerce-90/how_tos/web-service-developer-guide/
 *  https://developer.sana-commerce.com/
 */

import { customForm } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product, ProductVariant } from '../../schema/product'
import type { Collection } from '../../schema/collection'
import type { Customer } from '../../schema/customer'
import type { Order } from '../../schema/order'

import { buildAuthUrl, exchangeCode as sanaExchangeCode } from './auth'
import { SanaCommerceClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import {
  transformProduct,
  transformVariant,
  type RawSanaProduct,
  type RawSanaUnit,
} from './transform/product'
import { transformCollection, type RawSanaCategory } from './transform/collection'
import { transformCustomer, type RawSanaCustomer } from './transform/customer'
import { transformOrder, untransformOrder, type RawSanaOrder } from './transform/order'

// ── Credential form (api_key model) ──────────────────────────────────────────

const CRED_FORM = customForm({
  fields: [
    {
      name: 'siteUrl',
      label: 'Store URL',
      type: 'text',
      placeholder: 'https://store.example.com',
      helpText: 'The base URL of your Sana Commerce storefront.',
      required: true,
    },
    {
      name: 'username',
      label: 'Service account username',
      type: 'text',
      helpText: 'The username used to authenticate with the Sana Commerce web service.',
      required: true,
    },
    {
      name: 'apiKey',
      label: 'Service account password',
      type: 'password',
      helpText: 'The password for the Sana Commerce service account.',
      required: true,
    },
  ],
  async exchange(fields: Record<string, string>): Promise<Credentials> {
    const siteUrl = (fields['siteUrl'] ?? '').trim()
    const username = (fields['username'] ?? '').trim()
    const password = (fields['apiKey'] ?? '').trim()
    if (!siteUrl) throw new Error('Store URL is required.')
    if (!username) throw new Error('Service account username is required.')
    if (!password) throw new Error('Service account password is required.')
    return {
      accessToken: password,
      extra: { siteUrl, username },
    }
  },
})

export interface SanaCommerceAdapterConfig {
  /** Fallback site URL if not in per-connection credentials. */
  siteUrl?: string
  /** Fallback username if not in per-connection credentials. */
  username?: string
}

export class SanaCommerceAdapter implements EcommerceAdapter {
  readonly platform = 'sana-commerce'
  readonly version = '0.1.0'

  // Connect Link support — custom form (api_key model).
  credentialFields = CRED_FORM.credentialFields
  exchangeCredentials = CRED_FORM.exchangeCredentials

  private configSiteUrl: string | undefined
  private configUsername: string | undefined

  constructor(config: SanaCommerceAdapterConfig = {}) {
    this.configSiteUrl = config.siteUrl
    this.configUsername = config.username
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    return buildAuthUrl(this.configSiteUrl ?? 'https://your-sana-store.example')
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    return sanaExchangeCode()
  }

  /**
   * Sana Commerce session tickets are short-lived but the adapter obtains
   * a fresh ticket per client instance. Returning credentials unchanged is
   * correct — the ticket is re-fetched transparently by SanaCommerceClient.
   */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private clientFor(credentials: Credentials): SanaCommerceClient {
    const siteUrl =
      (credentials.extra?.['siteUrl'] as string | undefined) ?? this.configSiteUrl
    const username =
      (credentials.extra?.['username'] as string | undefined) ?? this.configUsername

    if (!siteUrl) {
      throw new Error(
        'Sana Commerce adapter: siteUrl is required. ' +
          'Supply it in credentials.extra.siteUrl or adapter config.',
      )
    }
    if (!username) {
      throw new Error(
        'Sana Commerce adapter: username is required. ' +
          'Supply it in credentials.extra.username or adapter config.',
      )
    }

    const merged: Credentials = {
      ...credentials,
      extra: { ...credentials.extra, siteUrl, username },
    }
    return new SanaCommerceClient(merged)
  }

  private pageParams(params: QueryParams): { pageSize: number; page: number } {
    return {
      pageSize: params.limit ?? DEFAULT_PAGE_SIZE,
      page: (params.page as number | undefined) ?? 0,
    }
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const { pageSize, page } = this.pageParams(params)
    // catalog/productsbyloadoptions expects a PUT with a LoadOptions body.
    const client = this.clientFor(credentials)
    const items = await client.put<RawSanaProduct[]>('catalog/productsbyloadoptions', {
      PageIndex: page,
      PageSize: pageSize,
    })
    return (Array.isArray(items) ? items : []).map((p) => transformProduct(p))
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const client = this.clientFor(credentials)
    const raw = await client.get<RawSanaProduct>(`catalog/product/${encodeURIComponent(id)}`)
    return transformProduct(raw)
  }

  // ── Variants ──────────────────────────────────────────────────────────────

  async listVariants(credentials: Credentials, params: QueryParams): Promise<ProductVariant[]> {
    const productId = (params['productId'] ?? params['product_id']) as string | undefined
    if (!productId) {
      throw new Error(
        'Sana Commerce listVariants requires ?product_id= — variants are nested under a product.',
      )
    }
    const client = this.clientFor(credentials)
    const raw = await client.get<RawSanaProduct>(`catalog/product/${encodeURIComponent(productId)}`)
    const currency = (raw.Currency ?? raw.currency ?? 'EUR') as string
    const units = raw.Units ?? raw.units ?? []
    return units.map((u: RawSanaUnit) => transformVariant(u, productId, currency))
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    // Composite id: `productId:unitId`
    const [productId, unitId] = id.split(':')
    if (!productId || !unitId) {
      throw new Error('Sana Commerce variant id must be `productId:unitId`')
    }
    const client = this.clientFor(credentials)
    const raw = await client.get<RawSanaProduct>(`catalog/product/${encodeURIComponent(productId)}`)
    const currency = (raw.Currency ?? raw.currency ?? 'EUR') as string
    const units = raw.Units ?? raw.units ?? []
    const unit = units.find((u: RawSanaUnit) => {
      const uid = u.Id ?? u.id
      return uid != null && String(uid) === unitId
    })
    if (!unit) throw new Error(`Sana Commerce: unit '${unitId}' not found on product '${productId}'`)
    return transformVariant(unit, productId, currency)
  }

  // ── Collections ───────────────────────────────────────────────────────────

  async listCollections(credentials: Credentials, params: QueryParams): Promise<Collection[]> {
    const { pageSize, page } = this.pageParams(params)
    const client = this.clientFor(credentials)
    const res = await client.listWithPage<RawSanaCategory>(
      'catalog/productcategories',
      pageSize,
      page,
    )
    return res.items.map(transformCollection)
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const client = this.clientFor(credentials)
    // Sana Commerce does not have a single-category endpoint; fetch the full
    // list and find by id. Category sets are typically small.
    const res = await client.listWithPage<RawSanaCategory>(
      'catalog/productcategories',
      100,
      0,
    )
    const cat = res.items.find(
      (c) => String(c.Id ?? c.id) === id,
    )
    if (!cat) throw new Error(`Sana Commerce: category '${id}' not found`)
    return transformCollection(cat)
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const { pageSize, page } = this.pageParams(params)
    const client = this.clientFor(credentials)
    const res = await client.listWithPage<RawSanaCustomer>(
      'customer/search',
      pageSize,
      page,
    )
    return res.items.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    // Sana Commerce does not expose a single-customer GET by id; use search
    // with a filter and return the first matching result.
    const client = this.clientFor(credentials)
    const res = await client.listWithPage<RawSanaCustomer>(
      'customer/search',
      100,
      0,
      { customerId: id },
    )
    const found = res.items.find(
      (c) => String(c.Id ?? c.id ?? c.CustomerId ?? c.customerId) === id,
    )
    if (!found) throw new Error(`Sana Commerce: customer '${id}' not found`)
    return transformCustomer(found)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const { pageSize, page } = this.pageParams(params)
    // pendingorders uses PUT with a LoadOptions body.
    const client = this.clientFor(credentials)
    const items = await client.put<RawSanaOrder[]>('order/pendingorders', {
      PageIndex: page,
      PageSize: pageSize,
    })
    return (Array.isArray(items) ? items : []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = this.clientFor(credentials)
    // Composite id format: `orderType:orderId` (e.g. `Order:SO-1001`)
    // If no colon, assume type 'Order'.
    const [orderType, orderId] = id.includes(':') ? id.split(':') : ['Order', id]
    const raw = await client.get<RawSanaOrder>(
      `order/details/${encodeURIComponent(orderType ?? 'Order')}/${encodeURIComponent(orderId ?? id)}`,
    )
    return transformOrder(raw)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = this.clientFor(credentials)
    const raw = await client.put<RawSanaOrder>('order/placeorder', untransformOrder(data))
    return transformOrder(raw)
  }
}
