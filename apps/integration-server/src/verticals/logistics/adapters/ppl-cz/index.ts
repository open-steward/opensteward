import {
  connectionScope,
  cursorPagerKey,
  oauth2ClientCredentials,
  pageByRows,
  pageLocally,
  pageOffset,
  reportUpstreamPage,
} from '@opensteward/shared'
import type { LogisticsAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { Order } from '../../schema/order'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Label } from '../../schema/label'
import type { Carrier } from '../../schema/carrier'
import type { Warehouse } from '../../schema/warehouse'

import { exchangeClientCredentials, refreshCredentials as doRefresh, isTokenValid } from './auth'
import { PplCzClient } from './client'
import {
  PPL_CZ_TOKEN_URL,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  SHIPMENT_MAX_LIMIT,
  TRACKING_SHIPMENTS_PAGE_SIZE,
} from './constants'

import { transformShipment, type PplCzShipment, type PplCzBatchResult } from './transform/shipment'
import { transformParcelStatus, type PplCzParcelStatus } from './transform/tracking'
import { transformLabel, labelFromShipmentEntry, type PplCzLabel } from './transform/label'
import { transformOrder, type PplCzOrder } from './transform/order'
import { transformCarrierFromProducts, type PplCzProduct } from './transform/carrier'
import { transformWarehouse, type PplCzCustomerAddress } from './transform/warehouse'

// ── Resource coverage ──────────────────────────────────────────────────────
// Unavailable: manifest  — CPL API has no manifest/handover-note endpoint; batch ops produce labels only
// Unavailable: rate      — CPL API exposes no public rate calculator endpoint

// ── Credential form ───────────────────────────────────────────────────────

const OAUTH2_FORM = oauth2ClientCredentials({
  tokenUrl: PPL_CZ_TOKEN_URL,
  scopes: ['myapi2'],
})

// ── Adapter ───────────────────────────────────────────────────────────────

export class PplCzAdapter implements LogisticsAdapter {
  // Connect Link support — OAuth2 client-credentials form
  credentialFields = OAUTH2_FORM.credentialFields
  exchangeCredentials = OAUTH2_FORM.exchangeCredentials

  readonly platform = 'ppl-cz'
  readonly version = '1'

  // ── Auth ──────────────────────────────────────────────────────────────

  /**
   * PPL CZ uses OAuth2 client_credentials — there is no redirect-based
   * getAuthUrl flow. We return the developer portal URL as a no-op so that
   * the Connect Link form flow handles credential collection instead.
   */
  getAuthUrl(_state: string): string {
    return 'https://developer.ppl.cz/en/'
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // In the Connect Link form flow, the "code" field is not used for OAuth2
    // client_credentials. Credentials are already exchanged via exchangeCredentials.
    // This path is a fallback: treat `code` as a pre-issued access token.
    return { accessToken: code }
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (isTokenValid(credentials)) return credentials
    return doRefresh(credentials)
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  private async client(credentials: Credentials): Promise<PplCzClient> {
    const fresh = await this.refreshCredentials(credentials)
    return new PplCzClient(fresh)
  }

  // ── Shipments ─────────────────────────────────────────────────────────

  /**
   * List shipments via GET /shipment.
   *
   * Offset-paged: `Limit` (1..1000) and a 0-based `Offset`; the response's
   * `X-Paging-Total-Items-Count` header gives the total, which makes hasMore
   * exact. https://ppl-cpl-api-en.apidog.io/shipment-tracking-13601484e0.md
   *
   * Supports optional filters:
   *   - updatedAfter as lastUpdateDate
   */
  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const c = await this.client(credentials)
    const asked = params.limit ?? DEFAULT_PAGE_SIZE
    const limit = Math.min(asked, SHIPMENT_MAX_LIMIT)
    const offset = pageOffset(params, limit)
    const query: Record<string, unknown> = {
      Limit: limit,
      Offset: offset,
    }
    if (params.updatedAfter) {
      query['lastUpdateDate'] = params.updatedAfter.toISOString()
    }
    const { data, totalCount } = await c.getPage<PplCzShipment[]>('shipment', query)
    const rows = Array.isArray(data) ? data : []
    reportUpstreamPage(params, {
      ...(totalCount !== undefined
        ? { totalCount, hasMore: offset + rows.length < totalCount }
        : {}),
      ...(limit < asked ? { pageSize: limit } : {}),
    })
    return rows.map(transformShipment)
  }

  /**
   * Get a single shipment by its PPL shipment number.
   * Uses GET /shipment?packNumber={id}
   */
  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const c = await this.client(credentials)
    const res = await c.get<PplCzShipment[]>('shipment', { packNumber: id, Limit: 1, Offset: 0 })
    const raw = (res ?? [])[0]
    if (!raw) throw new Error(`PPL CZ shipment not found: ${id}`)
    return transformShipment(raw)
  }

  /**
   * Create a shipment via POST /shipment/batch (asynchronous).
   *
   * PPL CZ batches are asynchronous: the POST returns a batchId, then we poll
   * GET /shipment/batch/{batchId} until importState is "Imported" or "Error".
   */
  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const c = await this.client(credentials)

    const recipient = data.destinationAddress
      ? {
          name: data.destinationAddress.name ?? undefined,
          name2: data.destinationAddress.company ?? undefined,
          street: data.destinationAddress.street1 ?? undefined,
          city: data.destinationAddress.city ?? undefined,
          zipCode: data.destinationAddress.postalCode ?? undefined,
          country: data.destinationAddress.country ?? undefined,
          phone: data.destinationAddress.phone ?? undefined,
          email: data.destinationAddress.email ?? undefined,
        }
      : { zipCode: '', country: 'CZ' }

    const sender = data.originAddress
      ? {
          name: data.originAddress.name ?? undefined,
          name2: data.originAddress.company ?? undefined,
          street: data.originAddress.street1 ?? undefined,
          city: data.originAddress.city ?? undefined,
          zipCode: data.originAddress.postalCode ?? undefined,
          country: data.originAddress.country ?? undefined,
          phone: data.originAddress.phone ?? undefined,
          email: data.originAddress.email ?? undefined,
        }
      : undefined

    const batchId = await c.postBatch('shipment/batch', {
      shipments: [
        {
          referenceId: data.reference ?? undefined,
          productType: data.serviceCode ?? 'BUSS',
          recipient,
          sender,
          note: data.notes ?? undefined,
        },
      ],
      labelSettings: {
        format: 'Pdf',
        completeLabelSettings: {
          isCompleteLabelRequested: true,
          pageSize: 'Default',
          position: 1,
        },
      },
    })

    // Poll batch status until processing is complete
    const result = await this.pollBatch(c, batchId)
    const raw = (result.shipments ?? [])[0]
    if (!raw) throw new Error(`PPL CZ batch ${batchId} returned no shipments`)
    return transformShipment(raw)
  }

  /**
   * Cancel a shipment (PPL CZ supports cancellation via POST /order/cancel).
   */
  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const c = await this.client(credentials)
    await c.post('order/cancel', { shipmentNumber: id })
  }

  // ── Orders ────────────────────────────────────────────────────────────

  /**
   * Create a pickup/collection order via POST /order.
   */
  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const c = await this.client(credentials)
    const raw = await c.post<PplCzOrder>('order', {
      referenceId: data.orderNumber ?? undefined,
      sender: data.originAddress
        ? {
            name: data.originAddress.name ?? undefined,
            name2: data.originAddress.company ?? undefined,
            street: data.originAddress.street1 ?? undefined,
            city: data.originAddress.city ?? undefined,
            zipCode: data.originAddress.postalCode ?? undefined,
            country: data.originAddress.country ?? undefined,
            phone: data.originAddress.phone ?? undefined,
            email: data.originAddress.email ?? undefined,
          }
        : undefined,
      note: data.notes ?? undefined,
    })
    return transformOrder(raw)
  }

  /**
   * Get a pickup order by its batch ID via GET /order/batch/{orderId}.
   */
  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const c = await this.client(credentials)
    const raw = await c.get<PplCzOrder>(`order/batch/${id}`)
    return transformOrder(raw)
  }

  /**
   * Cancel an order via POST /order/cancel.
   */
  async cancelOrder(credentials: Credentials, id: string): Promise<void> {
    const c = await this.client(credentials)
    await c.post('order/cancel', { orderId: id })
  }

  // ── Tracking Events ───────────────────────────────────────────────────

  /**
   * Get tracking events for a single shipment number.
   * Uses GET /shipment?packNumber={trackingNumber} which returns state history.
   */
  async getTrackingEvents(
    credentials: Credentials,
    trackingNumber: string,
  ): Promise<TrackingEvent[]> {
    const c = await this.client(credentials)
    const res = await c.get<PplCzParcelStatus[]>('shipment', {
      packNumber: trackingNumber,
      Limit: 1,
      Offset: 0,
    })
    const raw = (res ?? [])[0]
    if (!raw) return []
    return transformParcelStatus(raw)
  }

  /**
   * List recent tracking events across all shipments.
   *
   * GET /shipment is offset-paged by shipment (`Limit`/`Offset`, total in
   * `X-Paging-Total-Items-Count`), but each shipment flattens into one or
   * more events, so one upstream page is not one caller page. pageByRows
   * walks fixed-size shipment pages and cuts the event rows to the caller's
   * page. https://ppl-cpl-api-en.apidog.io/shipment-tracking-13601484e0.md
   */
  async listTrackingEvents(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<TrackingEvent[]> {
    const c = await this.client(credentials)
    const size = TRACKING_SHIPMENTS_PAGE_SIZE
    const filters: Record<string, unknown> = {}
    if (params.updatedAfter) {
      filters['lastUpdateDate'] = params.updatedAfter.toISOString()
    }
    const extra = credentials.extra as Record<string, unknown> | undefined
    const account = typeof extra?.['clientId'] === 'string' ? extra['clientId'] : 'ppl-cz'
    const key = cursorPagerKey(connectionScope(account, credentials), 'tracking-events', {
      ...filters,
      Limit: size,
    })
    const { items } = await pageByRows<TrackingEvent, number>(
      key,
      params,
      async (offset = 0) => {
        const { data, totalCount } = await c.getPage<PplCzParcelStatus[]>('shipment', {
          ...filters,
          Limit: size,
          Offset: offset,
        })
        const rows = Array.isArray(data) ? data : []
        const end = offset + rows.length
        const more =
          rows.length > 0 && (totalCount !== undefined ? end < totalCount : rows.length === size)
        return { items: rows.flatMap(transformParcelStatus), next: more ? end : null }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return items
  }

  // ── Carriers ──────────────────────────────────────────────────────────

  /**
   * List carriers via GET /codelist/product.
   *
   * PPL CZ is a single carrier. We synthesise one Carrier record from the
   * /codelist/product response, which enumerates all available service codes.
   *
   * The collection is that one carrier, so it is paged locally: page 1 holds
   * it and reports the end, and page 2 is empty instead of repeating it. The
   * caller's page and limit count carriers, not products, so the product
   * request is the same one getCarrier sends.
   */
  async listCarriers(credentials: Credentials, params: QueryParams): Promise<Carrier[]> {
    const c = await this.client(credentials)
    const products = await c.get<PplCzProduct[]>('codelist/product', {
      Limit: MAX_PAGE_SIZE,
      Offset: 0,
    })
    const carrier = transformCarrierFromProducts(Array.isArray(products) ? products : [])
    return pageLocally([carrier], params)
  }

  /**
   * Get the PPL CZ carrier by id (only "ppl-cz" is valid).
   * Fetches the full service list via GET /codelist/product.
   */
  async getCarrier(credentials: Credentials, _id: string): Promise<Carrier> {
    const c = await this.client(credentials)
    const products = await c.get<PplCzProduct[]>('codelist/product', {
      Limit: MAX_PAGE_SIZE,
      Offset: 0,
    })
    return transformCarrierFromProducts(products ?? [])
  }

  // ── Warehouses ─────────────────────────────────────────────────────────

  /**
   * Every address the account has stored, from GET /customer/address.
   *
   * https://ppl-cpl-api-en.apidog.io/customer-addresess-13601472e0.md: "a list
   * of addresses stored for that customer" (head office, "additional branch
   * offices or warehouses"). The method documents no query parameters (no
   * Limit/Offset), and a 200 is "type: array" of AddressModel, so one call
   * returns the whole collection. A body that is not that array throws: an
   * empty result would be reported as a complete, empty collection.
   */
  private async customerAddresses(c: PplCzClient): Promise<PplCzCustomerAddress[]> {
    const addresses = await c.get<unknown>('customer/address')
    if (!Array.isArray(addresses)) {
      throw new Error('PPL CZ GET /customer/address did not return the documented array')
    }
    return addresses as PplCzCustomerAddress[]
  }

  /**
   * List warehouses via GET /customer/address, which is unpaginated, so the
   * whole list is paged locally to the caller's page and limit.
   */
  async listWarehouses(credentials: Credentials, params: QueryParams): Promise<Warehouse[]> {
    const c = await this.client(credentials)
    return pageLocally(await this.customerAddresses(c), params).map(transformWarehouse)
  }

  /**
   * Get a warehouse by its PPL address code via GET /customer/address (the
   * API has no lookup by code, so the list is searched).
   */
  async getWarehouse(credentials: Credentials, id: string): Promise<Warehouse> {
    const c = await this.client(credentials)
    const raw = (await this.customerAddresses(c)).find((a) => a.code === id)
    if (!raw) throw new Error(`PPL CZ customer address not found: ${id}`)
    return transformWarehouse(raw)
  }

  // ── Rates ─────────────────────────────────────────────────────────────
  // getRates is intentionally omitted: the CPL API exposes no public rate
  // calculator endpoint — leaving it off makes the router answer 501
  // NOT_IMPLEMENTED instead of a false 200 with no rates.

  // ── Labels ────────────────────────────────────────────────────────────

  /**
   * Get a label by shipment number via GET /shipment/batch/{batchId}/label.
   *
   * Since PPL CZ labels are retrieved from the batch that created the
   * shipment, `id` here is expected to be a batchId. The method downloads
   * the binary PDF and encodes it as base64.
   */
  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    const c = await this.client(credentials)
    const buf = await c.getLabelBinary(`shipment/batch/${id}/label`, {
      Limit: 1,
      Offset: 0,
    })
    const raw: PplCzLabel = {
      shipmentNumber: id,
      format: 'Pdf',
      labelContent: Buffer.from(buf).toString('base64'),
    }
    return transformLabel(raw)
  }

  /**
   * Create a label by creating a shipment in a batch and immediately
   * downloading its label. Returns the label with a base64 PDF payload.
   */
  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    const c = await this.client(credentials)

    const batchId = await c.postBatch('shipment/batch', {
      shipments: [
        {
          referenceId: data.shipmentId ?? undefined,
          productType: data.serviceCode ?? 'BUSS',
          recipient: { zipCode: '', country: 'CZ' },
        },
      ],
      labelSettings: {
        format: 'Pdf',
        completeLabelSettings: {
          isCompleteLabelRequested: true,
          pageSize: 'Default',
          position: 1,
        },
      },
    })

    const result = await this.pollBatch(c, batchId)
    const shipment = (result.shipments ?? [])[0]
    const shipmentNumber = shipment?.shipmentNumber ?? batchId

    return labelFromShipmentEntry(
      shipmentNumber,
      shipment?.referenceId ?? undefined,
      shipment?.productType ?? undefined,
      undefined,
    )
  }

  /**
   * Void a label by cancelling the associated shipment.
   */
  async voidLabel(credentials: Credentials, id: string): Promise<void> {
    const c = await this.client(credentials)
    await c.post('order/cancel', { shipmentNumber: id })
  }

  // ── Internal helpers ──────────────────────────────────────────────────

  /**
   * Poll GET /shipment/batch/{batchId} until importState is terminal.
   * Waits up to ~30 seconds with exponential back-off.
   */
  private async pollBatch(client: PplCzClient, batchId: string): Promise<PplCzBatchResult> {
    const MAX_ATTEMPTS = 10
    const BASE_DELAY_MS = 500

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const result = await client.get<PplCzBatchResult>(`shipment/batch/${batchId}`)
      const state = (result.importState ?? '').toLowerCase()

      if (state === 'imported' || state === 'error' || state === 'completed') {
        return result
      }

      if (attempt < MAX_ATTEMPTS - 1) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt)
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }

    // Return whatever we have after exhausting attempts
    return client.get<PplCzBatchResult>(`shipment/batch/${batchId}`)
  }

  /**
   * Exchange client_id + client_secret for a token directly.
   * Used when the adapter is constructed with raw client credentials
   * rather than going through the form flow.
   */
  async exchangeRawCredentials(clientId: string, clientSecret: string): Promise<Credentials> {
    return exchangeClientCredentials(clientId, clientSecret)
  }
}
