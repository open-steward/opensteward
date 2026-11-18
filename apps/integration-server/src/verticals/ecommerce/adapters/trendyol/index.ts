/**
 * Trendyol adapter for the ecommerce vertical.
 *
 * Maps the Trendyol Partner API (apigw.trendyol.com) to the canonical
 * ecommerce resources. Trendyol uses HTTP Basic auth (apiKey:apiSecret)
 * plus a mandatory User-Agent header — there is no OAuth code-exchange flow.
 *
 * Supported resources (Trendyol has API coverage for):
 *   ✓ Products      — list, get, create (batch), update price+stock
 *   ✓ Collections   — list/get categories (read-only; Trendyol-managed)
 *   ✓ Locations     — synthetic single default location
 *   ✓ Inventory     — set/adjust via price-and-inventory batch endpoint
 *   ✓ Orders        — list, get shipment packages (read-only)
 *   ✓ Customers     — synthesized from order data (read-only)
 *   ✓ Fulfillments  — derived from order shipment package (cargo tracking fields)
 *   ✓ Refunds       — GET /integration/order/sellers/{id}/claims
 *   ✓ Transactions  — GET /integration/finance/che/sellers/{id}/settlements
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: discount — Trendyol Partner API has no discount/coupon/promotion endpoint for sellers
 *
 * Auth: credentials must include:
 *   { apiKey: string, apiSecret: string, supplierId: string }
 * stored as accessToken + extra on the Credentials object.
 *
 * Docs: https://developers.trendyol.com/
 */

import { customForm, pageLocally } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { Collection } from '../../schema/collection'
import type { Location } from '../../schema/location'
import type { InventoryLevel } from '../../schema/inventory'
import type { Customer } from '../../schema/customer'
import type { Order } from '../../schema/order'
import type { Fulfillment } from '../../schema/fulfillment'
import type { Refund } from '../../schema/refund'
import type { Transaction } from '../../schema/transaction'

import { exchangeCode as trendyolExchangeCode } from './auth'
import { TrendyolClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import {
  transformProduct,
  untransformProduct,
  type RawTrendyolProduct,
  type TrendyolPriceInventoryItem,
} from './transform/product'
import {
  transformCollection,
  flattenCategories,
  type RawTrendyolCategory,
} from './transform/collection'
import { transformOrder, type RawTrendyolOrder } from './transform/order'
import { transformCustomer } from './transform/customer'
import { transformInventoryLevel, type RawTrendyolStockItem } from './transform/inventory'
import { syntheticDefaultLocation } from './transform/location'
import { transformFulfillment } from './transform/fulfillment'
import { transformRefund, type RawTrendyolClaim } from './transform/refund'
import { transformTransaction, type RawTrendyolSettlement } from './transform/transaction'
import { minorToMajor } from '../../schema/shared'

// ── Credential form ────────────────────────────────────────────────────────

const CREDENTIAL_FORM = customForm({
  fields: [
    {
      name: 'supplierId',
      label: 'Supplier ID',
      type: 'text',
      required: true,
      helpText: 'Found in the Trendyol seller panel under Account Details → Integration Details.',
    },
    {
      name: 'apiKey',
      label: 'API key',
      type: 'password',
      required: true,
      helpText: 'API KEY from the Trendyol seller panel Integration Details page.',
    },
    {
      name: 'apiSecret',
      label: 'API secret',
      type: 'password',
      required: true,
      helpText: 'API SECRET KEY from the Trendyol seller panel Integration Details page.',
    },
  ],
  async exchange(fields): Promise<Credentials> {
    const supplierId = (fields['supplierId'] ?? '').trim()
    const apiKey = (fields['apiKey'] ?? '').trim()
    const apiSecret = (fields['apiSecret'] ?? '').trim()
    if (!supplierId) throw new Error('Supplier ID is required.')
    if (!apiKey) throw new Error('API key is required.')
    if (!apiSecret) throw new Error('API secret is required.')
    return {
      accessToken: apiKey,
      extra: { apiSecret, supplierId },
    }
  },
})

export interface TrendyolAdapterConfig {
  env?: 'prod' | 'stage'
}

export class TrendyolAdapter implements EcommerceAdapter {
  // Connect Link support — custom three-field form.
  credentialFields = CREDENTIAL_FORM.credentialFields
  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  readonly platform = 'trendyol'
  readonly version = '0.1.0'

  private env: 'prod' | 'stage'

  constructor(config: TrendyolAdapterConfig = {}) {
    this.env = config.env ?? 'prod'
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    // Trendyol has no OAuth authorize URL — point the user at the seller panel.
    return 'https://partner.trendyol.com/account/info'
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    return trendyolExchangeCode()
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Trendyol API keys do not expire — no-op refresh.
    return credentials
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private clientFor(credentials: Credentials): TrendyolClient {
    return new TrendyolClient(credentials, this.env)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      size: params.limit ?? DEFAULT_PAGE_SIZE,
    }
    if (params.page != null) out['page'] = params.page
    // Trendyol uses epoch ms timestamps for date filtering
    if (params.updatedAfter) {
      out['startDate'] = params.updatedAfter.getTime()
      out['dateQueryType'] = 'LAST_MODIFIED_DATE'
    }
    return out
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const client = this.clientFor(credentials)
    const path = `integration/product/sellers/${client.supplierId}/products`
    const res = await client.listWithPage<RawTrendyolProduct>(path, this.listParams(params))
    return res.items.map((p) => transformProduct(p))
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const client = this.clientFor(credentials)
    // Trendyol v3 base info endpoint: GET /integration/product/sellers/{sellerId}/product/{barcode}
    // Requires storeFrontCode header; fall back to filter by barcode.
    const path = `integration/product/sellers/${client.supplierId}/products`
    const res = await client.listWithPage<RawTrendyolProduct>(path, { barcode: id, size: 1 })
    const item = res.items[0]
    if (!item) throw new Error(`Trendyol: product with barcode '${id}' not found`)
    return transformProduct(item)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const client = this.clientFor(credentials)
    const path = `integration/product/sellers/${client.supplierId}/v2/products`
    const item = untransformProduct(data)
    // Trendyol product create returns { batchRequestId } — not the product itself.
    // We echo the input back as a canonical product with the barcode as id.
    await client.post<{ batchRequestId: string }>(path, { items: [item] })
    // Return a best-effort canonical product from the input data.
    const barcode = (item.barcode as string | undefined) ?? data.id ?? 'unknown'
    const variantCurrency = data.variants?.[0]?.price?.currency ?? 'TRY'
    return transformProduct({
      barcode,
      title: data.title ?? undefined,
      description: data.description ?? undefined,
      salePrice: data.variants?.[0]?.price?.amount != null
        ? minorToMajor(data.variants[0]!.price!.amount, variantCurrency)
        : undefined,
      listPrice: data.variants?.[0]?.compareAtPrice?.amount != null
        ? minorToMajor(data.variants[0]!.compareAtPrice!.amount, variantCurrency)
        : undefined,
      approved: false,
      ...item,
    } as unknown as RawTrendyolProduct)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const client = this.clientFor(credentials)
    // For full product update (title, description, images, etc.) use V2 update endpoint.
    const path = `integration/product/sellers/${client.supplierId}/v2/products`
    const item = untransformProduct(data, { barcode: id })
    await client.put<{ batchRequestId: string }>(path, { items: [item] })
    // Return a best-effort canonical product.
    return transformProduct({
      barcode: id,
      title: data.title ?? undefined,
      description: data.description ?? undefined,
      approved: true,
      ...item,
    } as unknown as RawTrendyolProduct)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    const client = this.clientFor(credentials)
    const path = `integration/product/sellers/${client.supplierId}/products`
    await client.delete(path, { barcode: id })
  }

  // ── Collections (Trendyol categories — read-only) ─────────────────────────

  async listCollections(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Collection[]> {
    const client = this.clientFor(credentials)
    const path = 'integration/product/product-categories'
    // getCategoryTree has no page or size parameter: every call returns the
    // whole tree, so the caller's page is sliced from the flattened list.
    const raw = await client.get<RawTrendyolCategory[]>(path)
    const rows = flattenCategories(Array.isArray(raw) ? raw : []).map(transformCollection)
    return pageLocally(rows, params)
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const client = this.clientFor(credentials)
    const path = 'integration/product/product-categories'
    const raw = await client.get<RawTrendyolCategory[]>(path)
    const flat = flattenCategories(Array.isArray(raw) ? raw : [])
    const cat = flat.find((c) => String(c.id) === id)
    if (!cat) throw new Error(`Trendyol: category '${id}' not found`)
    return transformCollection(cat)
  }

  // ── Locations ─────────────────────────────────────────────────────────────

  async listLocations(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Location[]> {
    const client = this.clientFor(credentials)
    // One synthetic location is the whole collection: page 2+ is empty.
    return pageLocally([syntheticDefaultLocation(client.supplierId)], params)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const client = this.clientFor(credentials)
    if (id !== 'default') {
      throw new Error(
        `Trendyol has no native locations; unknown location id '${id}'`,
      )
    }
    return syntheticDefaultLocation(client.supplierId)
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    const client = this.clientFor(credentials)
    // First fetch the current product to get current prices (required by endpoint).
    const productPath = `integration/product/sellers/${client.supplierId}/products`
    const res = await client.listWithPage<RawTrendyolProduct>(productPath, {
      barcode: data.variantId,
      size: 1,
    })
    const current = res.items[0]

    const item: TrendyolPriceInventoryItem = {
      barcode: data.variantId,
      quantity: data.available,
      salePrice: current?.salePrice ?? 0,
      listPrice: current?.listPrice ?? current?.salePrice ?? 0,
    }

    const updatePath = `integration/product/sellers/${client.supplierId}/products/price-and-inventory`
    await client.post<{ batchRequestId: string }>(updatePath, { items: [item] })

    return transformInventoryLevel({
      barcode: data.variantId,
      quantity: data.available,
      lastModifiedDate: Date.now(),
    } as RawTrendyolStockItem)
  }

  async adjustInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; delta: number },
  ): Promise<InventoryLevel> {
    const client = this.clientFor(credentials)
    // Fetch current stock to compute new quantity.
    const productPath = `integration/product/sellers/${client.supplierId}/products`
    const res = await client.listWithPage<RawTrendyolProduct>(productPath, {
      barcode: data.variantId,
      size: 1,
    })
    const current = res.items[0]
    const currentQty = current?.quantity ?? 0
    const newQty = Math.max(0, currentQty + data.delta)

    const item: TrendyolPriceInventoryItem = {
      barcode: data.variantId,
      quantity: newQty,
      salePrice: current?.salePrice ?? 0,
      listPrice: current?.listPrice ?? current?.salePrice ?? 0,
    }

    const updatePath = `integration/product/sellers/${client.supplierId}/products/price-and-inventory`
    await client.post<{ batchRequestId: string }>(updatePath, { items: [item] })

    return transformInventoryLevel({
      barcode: data.variantId,
      quantity: newQty,
      lastModifiedDate: Date.now(),
    } as RawTrendyolStockItem)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = this.clientFor(credentials)
    const path = `integration/order/sellers/${client.supplierId}/orders`
    const res = await client.listWithPage<RawTrendyolOrder>(path, this.listParams(params))
    return res.items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = this.clientFor(credentials)
    const path = `integration/order/sellers/${client.supplierId}/orders`
    const res = await client.listWithPage<RawTrendyolOrder>(path, {
      shipmentPackageIds: id,
      size: 1,
    })
    const item = res.items[0]
    if (!item) throw new Error(`Trendyol: order/package '${id}' not found`)
    return transformOrder(item)
  }

  // ── Fulfillments (derived from order shipment packages) ───────────────────

  async listFulfillments(credentials: Credentials, params: QueryParams): Promise<Fulfillment[]> {
    const client = this.clientFor(credentials)
    const path = `integration/order/sellers/${client.supplierId}/orders`
    const res = await client.listWithPage<RawTrendyolOrder>(path, this.listParams(params))
    // Only return fulfillments for packages that have tracking or are in a shipped+ status
    return res.items
      .filter((o) => {
        const status = (o.shipmentPackageStatus ?? o.status ?? '').toLowerCase()
        return (
          o.cargoTrackingNumber != null ||
          ['shipped', 'delivered', 'undelivered', 'atcollectionpoint'].includes(status)
        )
      })
      .map(transformFulfillment)
  }

  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    const client = this.clientFor(credentials)
    const path = `integration/order/sellers/${client.supplierId}/orders`
    const res = await client.listWithPage<RawTrendyolOrder>(path, {
      shipmentPackageIds: id,
      size: 1,
    })
    const item = res.items[0]
    if (!item) throw new Error(`Trendyol: shipment package '${id}' not found`)
    return transformFulfillment(item)
  }

  // ── Refunds (claims) ──────────────────────────────────────────────────────

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const client = this.clientFor(credentials)
    const path = `integration/order/sellers/${client.supplierId}/claims`
    const res = await client.listWithPage<RawTrendyolClaim>(path, this.listParams(params))
    return res.items.map(transformRefund)
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const client = this.clientFor(credentials)
    const path = `integration/order/sellers/${client.supplierId}/claims`
    const res = await client.listWithPage<RawTrendyolClaim>(path, { claimIds: id, size: 1 })
    const item = res.items[0]
    if (!item) throw new Error(`Trendyol: claim '${id}' not found`)
    return transformRefund(item)
  }

  // ── Transactions (settlements) ────────────────────────────────────────────

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = this.clientFor(credentials)
    const path = `integration/finance/che/sellers/${client.supplierId}/settlements`
    // Trendyol settlements require startDate+endDate (max 15-day window, epoch ms).
    // If updatedAfter is supplied by listParams, use it as startDate.
    // Default to the past 15 days so the call always succeeds.
    const now = Date.now()
    const fifteenDaysMs = 15 * 24 * 60 * 60 * 1000
    const listP = this.listParams(params)
    const startDate = (listP['startDate'] as number | undefined) ?? now - fifteenDaysMs
    const endDate = now
    const queryParams: Record<string, unknown> = {
      startDate,
      endDate,
      size: listP['size'] ?? DEFAULT_PAGE_SIZE,
    }
    if (listP['page'] != null) queryParams['page'] = listP['page']
    const res = await client.listWithPage<RawTrendyolSettlement>(path, queryParams)
    return res.items.map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    // Trendyol settlements API has no single-record lookup; search the past 15 days.
    const client = this.clientFor(credentials)
    const path = `integration/finance/che/sellers/${client.supplierId}/settlements`
    const now = Date.now()
    const fifteenDaysMs = 15 * 24 * 60 * 60 * 1000
    const res = await client.listWithPage<RawTrendyolSettlement>(path, {
      startDate: now - fifteenDaysMs,
      endDate: now,
      size: DEFAULT_PAGE_SIZE,
    })
    const item = res.items.find((t) => String(t.id) === id)
    if (!item) throw new Error(`Trendyol: settlement '${id}' not found in the past 15 days`)
    return transformTransaction(item)
  }

  // ── Customers (synthesized from order data) ───────────────────────────────

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    // Trendyol has no customer management API. Look up by customerId across recent orders.
    const client = this.clientFor(credentials)
    const path = `integration/order/sellers/${client.supplierId}/orders`
    const res = await client.listWithPage<RawTrendyolOrder>(path, { size: 200 })
    const order = res.items.find((o) => String(o.customerId) === id)
    if (!order) {
      throw new Error(
        `Trendyol: customer '${id}' not found in recent orders. ` +
          'Customer data is only available through order history.',
      )
    }
    return transformCustomer({
      customerId: order.customerId,
      customerFirstName: order.customerFirstName,
      customerLastName: order.customerLastName,
      customerEmail: order.customerEmail,
      phone: order.invoiceAddress?.phone ?? order.shipmentAddress?.phone ?? null,
      address: order.invoiceAddress ?? null,
    })
  }
}
