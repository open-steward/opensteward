// ── Resource coverage ──────────────────────────────────────────────
// Available:   rate, shipment, trackingevent, order (derived from shipment)
// Unavailable: carrier    — Senpex is a single-carrier courier; no carrier listing endpoint exists
// Unavailable: label      — courier dispatch model; no shipping label generation endpoint in API
// Unavailable: manifest   — no manifest/scan-form endpoint in Senpex API v4
// Unavailable: warehouse  — no warehouse management endpoint in Senpex API v4

import { customForm } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  RateRequestParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { Order } from '../../schema/order'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'

import { buildAuthUrl, exchangeApiKeys, refreshCredentials as doRefresh } from './auth'
import { SenpexClient } from './client'
import { transformShipment, type SenpexOrder } from './transform/shipment'
import { transformTracking } from './transform/tracking'
import { transformRate, type SenpexQuoteResponse } from './transform/rate'
import { PACK_SIZE, TRANSPORT_TYPE } from './constants'

/**
 * Response shape for GET /order-list.
 */
interface SenpexOrderListResponse {
  data?: SenpexOrder[] | null
  [key: string]: unknown
}

/**
 * Response shape for PUT /orders/dropoff or PUT /orders/pickup.
 */
interface SenpexCreateOrderResponse {
  inserted_id?: string | number | null
  distance?: number | null
  distance_time?: number | null
  [key: string]: unknown
}

const CREDENTIAL_FORM = customForm({
  fields: [
    {
      name: 'clientId',
      label: 'Client ID',
      type: 'text',
      required: true,
      helpText: 'Your Senpex client_id provided by Senpex support.',
    },
    {
      name: 'secretId',
      label: 'Secret ID',
      type: 'password',
      required: true,
      helpText: 'Your Senpex secret_id provided by Senpex support.',
    },
  ],
  async exchange(fields: Record<string, string>): Promise<Credentials> {
    const clientId = (fields['clientId'] ?? '').trim()
    const secretId = (fields['secretId'] ?? '').trim()
    return exchangeApiKeys(clientId, secretId)
  },
})

export class SenpexAdapter implements LogisticsAdapter {
  readonly platform = 'senpex'
  readonly version = '1'

  // Connect Link form — two-field API key pair
  credentialFields = CREDENTIAL_FORM.credentialFields
  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  // ── Auth ─────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // code is expected as "clientId:secretId" for programmatic use
    const sep = code.indexOf(':')
    const clientId = sep >= 0 ? code.slice(0, sep) : code
    const secretId = sep >= 0 ? code.slice(sep + 1) : ''
    return exchangeApiKeys(clientId, secretId)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Shipments ─────────────────────────────────────────────────────────────

  async listShipments(credentials: Credentials, params: { page?: number }): Promise<Shipment[]> {
    const client = new SenpexClient(credentials)
    const start = ((params.page ?? 1) - 1) * 12
    const res = await client.get<SenpexOrderListResponse | SenpexOrder[]>(
      start > 0 ? `/order-list?start=${start}` : '/order-list',
    )
    const rows: SenpexOrder[] = Array.isArray(res)
      ? res
      : ((res as SenpexOrderListResponse).data ?? [])
    return rows.map(transformShipment)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new SenpexClient(credentials)
    const raw = await client.get<SenpexOrder>(`/orders/details/${id}`)
    return transformShipment(raw)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new SenpexClient(credentials)

    const originText = formatAddress(data.originAddress)
    const destText = formatAddress(data.destinationAddress)

    const packSizeId = resolvePackSizeId(data.totalWeight?.value)

    // Step 1 — get a quote token
    const quoteBody = {
      order_name: data.reference ?? 'Delivery',
      pack_from_text: originText ?? '',
      transport_id: TRANSPORT_TYPE.CAR,
      item_value: 0,
      pack_size_id: packSizeId,
      order_desc: data.notes ?? '',
      route_desc: '',
      rec_name: data.destinationAddress?.name ?? '',
      rec_phone: data.destinationAddress?.phone ?? '',
      routes: [
        {
          route_to_text: destText ?? '',
          route_desc: data.notes ?? '',
          rec_name: data.destinationAddress?.name ?? '',
          rec_phone: data.destinationAddress?.phone ?? '',
        },
      ],
      taken_asap: 1,
    }

    const quote = await client.post<SenpexQuoteResponse>('/orders/dropoff/quote', quoteBody)

    // Step 2 — confirm the order
    const confirmBody: Record<string, unknown> = {
      api_token: quote.api_token ?? '',
      sender_name: data.originAddress?.name ?? '',
      sender_cell: data.originAddress?.phone ?? '',
      order_desc: data.notes ?? '',
    }

    const created = await client.put<SenpexCreateOrderResponse>('/orders/dropoff', confirmBody)
    const insertedId = created.inserted_id != null ? String(created.inserted_id) : undefined

    // Return enriched shipment if we have an ID, otherwise build from quote
    if (insertedId) {
      return this.getShipment(credentials, insertedId)
    }

    return transformShipment({
      order_name: data.reference ?? undefined,
      order_price: quote.order_price ?? undefined,
      pack_from_text: originText ?? undefined,
      routes: [{ route_to_text: destText ?? undefined }],
    })
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new SenpexClient(credentials)
    await client.put<Record<string, unknown>>(`/orders/cancel/${id}`, {})
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: { page?: number }): Promise<Order[]> {
    const shipments = await this.listShipments(credentials, params)
    return shipments.map(shipmentToOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const shipment = await this.getShipment(credentials, id)
    return shipmentToOrder(shipment)
  }

  async cancelOrder(credentials: Credentials, id: string): Promise<void> {
    return this.cancelShipment(credentials, id)
  }

  // ── Tracking Events ───────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, id: string): Promise<TrackingEvent[]> {
    const client = new SenpexClient(credentials)
    const raw = await client.get<SenpexOrder>(`/orders/details/${id}`)
    return transformTracking(raw)
  }

  // ── Rates ─────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new SenpexClient(credentials)

    const originText = formatAddress(params.originAddress)
    const destText = formatAddress(params.destinationAddress)
    const weightLbs = params.packages?.[0]?.weight?.value

    const body = {
      order_name: 'Rate quote',
      pack_from_text: originText ?? '',
      transport_id: TRANSPORT_TYPE.CAR,
      item_value: 0,
      pack_size_id: resolvePackSizeId(weightLbs),
      order_desc: '',
      route_desc: '',
      rec_name: params.destinationAddress.name ?? '',
      rec_phone: params.destinationAddress.phone ?? '',
      routes: [
        {
          route_to_text: destText ?? '',
          route_desc: '',
          rec_name: params.destinationAddress.name ?? '',
          rec_phone: params.destinationAddress.phone ?? '',
        },
      ],
      taken_asap: 1,
    }

    const quote = await client.post<SenpexQuoteResponse>('/orders/dropoff/quote', body)
    return [transformRate(quote)]
  }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function formatAddress(
  addr: Partial<{ street1?: string; city?: string; state?: string; postalCode?: string; country?: string }> | undefined,
): string | undefined {
  if (!addr) return undefined
  return [addr.street1, addr.city, addr.state, addr.postalCode, addr.country]
    .filter(Boolean)
    .join(', ') || undefined
}

function resolvePackSizeId(weightLbs: number | undefined): number {
  if (!weightLbs) return PACK_SIZE.SMALL
  if (weightLbs <= 25) return PACK_SIZE.SMALL
  if (weightLbs <= 50) return PACK_SIZE.MEDIUM
  if (weightLbs <= 70) return PACK_SIZE.LARGE
  if (weightLbs <= 150) return PACK_SIZE.HEAVY_LOAD
  return PACK_SIZE.BIG_LIGHTWEIGHT
}

function shipmentToOrder(shipment: Shipment): Order {
  const statusMap: Record<string, Order['status']> = {
    PENDING: 'PENDING',
    LABEL_CREATED: 'AWAITING_SHIPMENT',
    IN_TRANSIT: 'SHIPPED',
    OUT_FOR_DELIVERY: 'SHIPPED',
    DELIVERED: 'DELIVERED',
    EXCEPTION: 'ON_HOLD',
    RETURNED: 'RETURNED',
    CANCELLED: 'CANCELLED',
    UNKNOWN: 'PENDING',
  }

  return {
    id: shipment.id,
    status: statusMap[shipment.status ?? 'UNKNOWN'] ?? 'PENDING',
    orderNumber: shipment.reference,
    originAddress: shipment.originAddress,
    destinationAddress: shipment.destinationAddress,
    shippingAmount: shipment.cost?.amount,
    currency: (shipment.cost?.currency as Order['currency']) ?? 'USD',
    notes: shipment.notes,
    deliveredAt: shipment.actualDeliveryAt,
    createdAt: shipment.createdAt,
    updatedAt: shipment.updatedAt,
    metadata: shipment.metadata,
  }
}
