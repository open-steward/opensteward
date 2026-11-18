/**
 * Deposco WMS/OMS logistics adapter.
 *
 * First-party reference: the Deposco API OpenAPI document at
 * https://auth.deposco.com/public/spec?version=latest (rendered by
 * https://developer.deposco.com). Base URL https://api.deposco.com/latest;
 * OAuth 2.0 bearer tokens obtained from an installation's refresh token (see
 * `auth.ts`, `constants.ts`).
 *
 * Read coverage:
 *   - Customer orders: GET /orders/customerOrders, GET /orders/customerOrders/{orderId}
 *   - Outbound shipments: GET /shipments/outboundShipments,
 *     GET /shipments/outboundShipments/{shipmentId}
 *   - Warehouses: GET /facilities, GET /facilities/{facilityId}
 *   - Carriers, tracking events and labels refuse with 501: the reference has
 *     no carrier resource, no tracking-event history and no label resource.
 *
 * Paging (tag "Pagination"): "The Deposco API uses cursor-based pagination
 * … All `GET` list endpoints support a `pageSize` parameter … To retrieve the
 * next page of results, use the `href` value from the link where `rel` is
 * `next`. When no `next` link is present or `complete` is `true`, all results
 * have been retrieved." Each list walks that chain with `pageByCursor`, one
 * upstream page per caller page at the caller's limit clamped to the
 * endpoint's documented `pageSize` maximum.
 *
 * The write methods (createOrder, updateOrder, cancelOrder, createShipment,
 * cancelShipment) still call paths the reference does not document; they are
 * outside this rebuild and recorded for follow-up.
 *
 * No documented webhook signing scheme — webhook.ts is omitted.
 */
import {
  connectionScope,
  cursorPagerKey,
  customForm,
  pageByCursor,
  reportUpstreamPage,
} from '@opensteward/shared'
import type { LogisticsAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { Order } from '../../schema/order'
import type { Carrier } from '../../schema/carrier'
import type { Warehouse } from '../../schema/warehouse'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Label } from '../../schema/label'

import { buildAuthUrl, exchangeCredentials, refreshCredentials as doRefresh } from './auth'
import { DeposcoClient } from './client'
import {
  DEPOSCO_CUSTOMER_ORDERS_DEFAULT_PAGE_SIZE,
  DEPOSCO_CUSTOMER_ORDERS_MAX_PAGE_SIZE,
  DEPOSCO_DEFAULT_PAGE_SIZE,
  DEPOSCO_MAX_PAGE_SIZE,
} from './constants'
import { nextHref, type DeposcoCollection } from './dto'

import { transformShipment, type DeposcoOutboundShipment } from './transform/shipment'
import { transformOrder, type DeposcoCustomerOrder } from './transform/order'
import { transformWarehouse, type DeposcoFacility } from './transform/warehouse'

// ── Connect Link credential form ─────────────────────────────────────────────
// "Use the refresh token with the client ID and secret for the application to
// request an access token."
const CREDENTIAL_FORM = customForm({
  fields: [
    {
      name: 'clientId',
      label: 'Client ID',
      type: 'text',
      required: true,
      helpText: 'Shown on the application detail page in the Deposco developer portal.',
    },
    {
      name: 'clientSecret',
      label: 'Client secret',
      type: 'password',
      required: true,
    },
    {
      name: 'refreshToken',
      label: 'Refresh token',
      type: 'password',
      required: true,
      helpText:
        "Generated when the application is installed in your Deposco environment. Use 'Copy Refresh Token' on the installation in the developer portal.",
    },
  ],
  exchange: async (fields: Record<string, string>): Promise<Credentials> => {
    const clientId = (fields['clientId'] ?? '').trim()
    const clientSecret = (fields['clientSecret'] ?? '').trim()
    const refreshToken = (fields['refreshToken'] ?? '').trim()
    if (!clientId) throw new Error('Client ID is required.')
    if (!clientSecret) throw new Error('Client secret is required.')
    if (!refreshToken) throw new Error('Refresh token is required.')
    return exchangeCredentials({ clientId, clientSecret, refreshToken })
  },
})

interface DeposcoAdapterConfig {
  /** Override the business unit used for order import endpoints. */
  defaultBusinessUnit?: string
}

function notSupported(message: string): never {
  throw Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

const NO_CARRIERS =
  'Deposco cannot list carriers: the Deposco API reference has no carrier resource; a carrier appears only as the `shipVendor` string ("Shipping carrier that is used to send the shipment.") on shipments and orders'
const NO_TRACKING =
  'Deposco cannot list tracking events: an outbound shipment documents only `trackingNumber` and `trackingUrl` ("Tracking URL and tracking number for the shipment."), and the API reference has no tracking-event history'
const NO_LABELS =
  'Deposco cannot list labels: the Deposco API reference has no label resource, and the outbound shipment documents no label URL or label document'

export class DeposcoAdapter implements LogisticsAdapter {
  readonly platform = 'deposco'
  readonly version = '1'
  /** `pageSize` "maximum: 100" on outbound shipments and facilities; customer orders (max 50) report the size they send. */
  readonly capabilities = { maxPageSize: DEPOSCO_MAX_PAGE_SIZE }

  credentialFields = CREDENTIAL_FORM.credentialFields
  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  private readonly defaultBusinessUnit: string

  constructor(config: DeposcoAdapterConfig = {}) {
    this.defaultBusinessUnit = config.defaultBusinessUnit ?? 'default'
  }

  // ── Auth ────────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // code is expected as "clientId:clientSecret:refreshToken"
    const [clientId, clientSecret, ...rest] = code.split(':')
    const refreshToken = rest.join(':')
    if (!clientId || !clientSecret || !refreshToken) {
      throw new Error(
        'Deposco exchangeCode expects code in the format "clientId:clientSecret:refreshToken"',
      )
    }
    return exchangeCredentials({ clientId, clientSecret, refreshToken })
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Paging ──────────────────────────────────────────────────────────────────

  /**
   * One caller page of a documented list endpoint. Page 1 is `GET <path>`
   * with `pageSize` and the documented filters; page N follows the
   * `links[rel=next]` href of page N-1, which the cursor pager remembers.
   */
  private async listPage<R>(
    credentials: Credentials,
    params: QueryParams,
    path: string,
    defaultSize: number,
    maxSize: number,
  ): Promise<R[]> {
    const size = Math.min(params.limit ?? defaultSize, maxSize)
    const query: Record<string, string | number> = { pageSize: size }
    // `updatedAfter`: "Search field for finding records updated after the
    // specified date and time in [ISO 8601](https://en.wikipedia.org/wiki/ISO_8601) format."
    // Documented on all three lists.
    if (params.updatedAfter instanceof Date) query.updatedAfter = params.updatedAfter.toISOString()

    const client = new DeposcoClient(credentials)
    const key = cursorPagerKey(connectionScope('deposco', credentials), path, query)
    const { items, hasMore } = await pageByCursor<R, string>(key, params.page, async (href) => {
      const res =
        href === undefined
          ? await client.get<DeposcoCollection<R>>(path, query)
          : await client.getNext<DeposcoCollection<R>>(href)
      return { items: res.data ?? [], next: nextHref(res) }
    })
    reportUpstreamPage(
      params,
      params.limit !== undefined && size < params.limit ? { hasMore, pageSize: size } : { hasMore },
    )
    return items
  }

  // ── Orders ──────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const rows = await this.listPage<DeposcoCustomerOrder>(
      credentials,
      params,
      'orders/customerOrders',
      DEPOSCO_CUSTOMER_ORDERS_DEFAULT_PAGE_SIZE,
      DEPOSCO_CUSTOMER_ORDERS_MAX_PAGE_SIZE,
    )
    return rows.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new DeposcoClient(credentials)
    // 200: CustomerOrderResponseDTO — "Response for getting a specific customer
    // order", which wraps the order in `customerOrder` beside `notices`.
    const res = await client.get<{ customerOrder?: DeposcoCustomerOrder | null }>(
      `orders/customerOrders/${encodeURIComponent(id)}`,
    )
    if (!res.customerOrder) throw new Error(`Deposco returned no customerOrder for order ${id}`)
    return transformOrder(res.customerOrder)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new DeposcoClient(credentials)
    const businessUnit = (data.metadata as Record<string, unknown> | undefined)?.businessUnit
      ?? this.defaultBusinessUnit
    const orderNumber = data.orderNumber ?? data.id ?? ''
    const raw = await client.put<DeposcoCustomerOrder>(
      `import/${encodeURIComponent(String(businessUnit))}/customerOrder/${encodeURIComponent(orderNumber)}`,
      {
        orderNumber,
        externalOrderNumber: data.orderNumber,
        serviceCode: data.requestedServiceCode,
        notes: data.notes,
        shipToAddress: data.destinationAddress
          ? {
              name: data.destinationAddress.name,
              company: data.destinationAddress.company,
              street1: data.destinationAddress.street1,
              street2: data.destinationAddress.street2,
              city: data.destinationAddress.city,
              state: data.destinationAddress.state,
              postalCode: data.destinationAddress.postalCode,
              country: data.destinationAddress.country,
              phone: data.destinationAddress.phone,
              email: data.destinationAddress.email,
            }
          : undefined,
        shipFromAddress: data.originAddress
          ? {
              name: data.originAddress.name,
              company: data.originAddress.company,
              street1: data.originAddress.street1,
              street2: data.originAddress.street2,
              city: data.originAddress.city,
              state: data.originAddress.state,
              postalCode: data.originAddress.postalCode,
              country: data.originAddress.country,
              phone: data.originAddress.phone,
              email: data.originAddress.email,
            }
          : undefined,
        items: data.lineItems?.map((li) => ({
          sku: li.sku,
          quantity: li.quantity,
          description: li.description,
          unitPrice: li.unitAmount,
        })),
      },
    )
    return transformOrder(raw)
  }

  async updateOrder(credentials: Credentials, id: string, data: Partial<Order>): Promise<Order> {
    const client = new DeposcoClient(credentials)
    const businessUnit =
      (data.metadata as Record<string, unknown> | undefined)?.businessUnit ??
      this.defaultBusinessUnit
    const raw = await client.put<DeposcoCustomerOrder>(
      `import/${encodeURIComponent(String(businessUnit))}/customerOrder/${encodeURIComponent(id)}`,
      {
        externalOrderNumber: id,
        serviceCode: data.requestedServiceCode,
        notes: data.notes,
        shipToAddress: data.destinationAddress
          ? {
              name: data.destinationAddress.name,
              company: data.destinationAddress.company,
              street1: data.destinationAddress.street1,
              street2: data.destinationAddress.street2,
              city: data.destinationAddress.city,
              state: data.destinationAddress.state,
              postalCode: data.destinationAddress.postalCode,
              country: data.destinationAddress.country,
              phone: data.destinationAddress.phone,
              email: data.destinationAddress.email,
            }
          : undefined,
      },
    )
    return transformOrder(raw)
  }

  async cancelOrder(credentials: Credentials, id: string): Promise<void> {
    const client = new DeposcoClient(credentials)
    await client.post<unknown>(`orders/${encodeURIComponent(id)}/cancel`, {})
  }

  // ── Shipments ───────────────────────────────────────────────────────────────

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const rows = await this.listPage<DeposcoOutboundShipment>(
      credentials,
      params,
      'shipments/outboundShipments',
      DEPOSCO_DEFAULT_PAGE_SIZE,
      DEPOSCO_MAX_PAGE_SIZE,
    )
    return rows.map(transformShipment)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new DeposcoClient(credentials)
    const raw = await client.get<DeposcoOutboundShipment>(
      `shipments/outboundShipments/${encodeURIComponent(id)}`,
    )
    return transformShipment(raw)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new DeposcoClient(credentials)
    const raw = await client.post<DeposcoOutboundShipment>('shipments', {
      reference: data.reference,
      serviceCode: data.serviceCode,
      carrierCode: data.carrierId,
      facilityNumber: data.warehouseId,
      weight: data.totalWeight?.value,
      weightUom: data.totalWeight?.unit,
      shipFromAddress: data.originAddress
        ? {
            name: data.originAddress.name,
            company: data.originAddress.company,
            street1: data.originAddress.street1,
            street2: data.originAddress.street2,
            city: data.originAddress.city,
            state: data.originAddress.state,
            postalCode: data.originAddress.postalCode,
            country: data.originAddress.country,
            phone: data.originAddress.phone,
            email: data.originAddress.email,
          }
        : undefined,
      shipToAddress: data.destinationAddress
        ? {
            name: data.destinationAddress.name,
            company: data.destinationAddress.company,
            street1: data.destinationAddress.street1,
            street2: data.destinationAddress.street2,
            city: data.destinationAddress.city,
            state: data.destinationAddress.state,
            postalCode: data.destinationAddress.postalCode,
            country: data.destinationAddress.country,
            phone: data.destinationAddress.phone,
            email: data.destinationAddress.email,
          }
        : undefined,
    })
    return transformShipment(raw)
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new DeposcoClient(credentials)
    await client.post<unknown>(`shipments/${encodeURIComponent(id)}/cancel`, {})
  }

  // ── Tracking Events ─────────────────────────────────────────────────────────

  async listTrackingEvents(
    _credentials: Credentials,
    _params: QueryParams,
  ): Promise<TrackingEvent[]> {
    notSupported(NO_TRACKING)
  }

  async getTrackingEvents(
    _credentials: Credentials,
    _trackingNumber: string,
  ): Promise<TrackingEvent[]> {
    notSupported(NO_TRACKING)
  }

  // ── Warehouses / Facilities ─────────────────────────────────────────────────

  async listWarehouses(credentials: Credentials, params: QueryParams): Promise<Warehouse[]> {
    const rows = await this.listPage<DeposcoFacility>(
      credentials,
      params,
      'facilities',
      DEPOSCO_DEFAULT_PAGE_SIZE,
      DEPOSCO_MAX_PAGE_SIZE,
    )
    return rows.map(transformWarehouse)
  }

  async getWarehouse(credentials: Credentials, id: string): Promise<Warehouse> {
    const client = new DeposcoClient(credentials)
    const raw = await client.get<DeposcoFacility>(`facilities/${encodeURIComponent(id)}`)
    return transformWarehouse(raw)
  }

  // ── Carriers ────────────────────────────────────────────────────────────────

  async listCarriers(_credentials: Credentials, _params: QueryParams): Promise<Carrier[]> {
    notSupported(NO_CARRIERS)
  }

  async getCarrier(_credentials: Credentials, _id: string): Promise<Carrier> {
    notSupported(NO_CARRIERS)
  }

  // ── Labels ──────────────────────────────────────────────────────────────────

  async listLabels(_credentials: Credentials, _params: QueryParams): Promise<Label[]> {
    notSupported(NO_LABELS)
  }

  async getLabel(_credentials: Credentials, _id: string): Promise<Label> {
    notSupported(NO_LABELS)
  }
}
