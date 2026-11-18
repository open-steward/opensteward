/**
 * pandago adapter — logistics vertical.
 *
 * pandago is Delivery Hero's on-demand last-mile courier service operating
 * across SE Asia (SG, HK, PH, MY, TH, TW, BD, KH, LA, MM) and Pakistan.
 *
 * Auth: OAuth 2.0 client_credentials with RSA-2048 / RS256 JWT assertion.
 *       Credentials are collected via the Connect Link form (credentialFields)
 *       and exchanged once for a short-lived Bearer token. Tokens are
 *       automatically refreshed via refreshCredentials().
 *
 * Supported resources:
 *   Shipments   — POST /orders, GET /orders/{id}, DELETE /orders/{id}
 *   Tracking    — GET /orders/{id} (synthesised from current status)
 *   Rates       — POST /orders/fee + POST /orders/time (merged)
 *   Orders      — GET /orders/{order_id} (get); listOrders refuses 501, no GET /orders
 *   Warehouses  — GET /outletList (list), GET /outlets/{client_vendor_id} (get)
 *
 * Webhooks:
 *   pandago pushes order status, courier location, and refund callbacks to
 *   customer-configured URLs. Callbacks are signed with HMAC-SHA256 via the
 *   X-Signature-SHA256 header (see webhook.ts).
 *
 * Reference: https://on-demand-rider-docs.deliveryhero.io/
 */
// ── Resource coverage ──────────────────────────────────────────────────────
// Unavailable: carrier   — pandago is itself a single courier; no carriers endpoint exists
// Unavailable: label     — on-demand service; shipping labels are not applicable
// Unavailable: manifest  — not applicable for last-mile on-demand delivery

import {
  pageLocally,
  type CredentialField,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import type { LogisticsAdapter, RateRequestParams } from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Order } from '../../schema/order'
import type { Warehouse } from '../../schema/warehouse'
import type { WebhookEvent } from '../../schema/webhook'

import {
  credentialFields as pandagoCredentialFields,
  exchangeCredentials as pandagoExchangeCredentials,
  refreshCredentials as pandagoRefreshCredentials,
  getAuthUrl as pandagoGetAuthUrl,
} from './auth'
import { PandagoClient } from './client'

import { transformShipment, type PandagoOrder } from './transform/shipment'
import { transformTracking } from './transform/tracking'
import { transformRate, type PandagoEstimate } from './transform/rate'
import { transformOrder } from './transform/order'
import { transformWarehouse, type PandagoOutlet } from './transform/warehouse'
import { verifyWebhook, parseWebhookEvents } from './webhook'

// ── Adapter config ───────────────────────────────────────────────────────────

export interface PandagoAdapterConfig {
  /** Not used at construction time — credentials supply country + sandbox flag. */
  countryCode?: string
}

// ── Cancel request body ──────────────────────────────────────────────────────

type CancellationReason = 'DELIVERY_ETA_TOO_LONG' | 'MISTAKE_ERROR' | 'REASON_UNKNOWN'

// ── Adapter ──────────────────────────────────────────────────────────────────

export class PandagoAdapter implements LogisticsAdapter {
  readonly platform = 'pandago'
  readonly version = '1'

  constructor(_config: PandagoAdapterConfig = {}) {}

  // ── Auth ───────────────────────────────────────────────────────────────────

  credentialFields(): CredentialField[] {
    return pandagoCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return pandagoExchangeCredentials(fields)
  }

  getAuthUrl(state: string): never {
    return pandagoGetAuthUrl(state)
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error(
      'pandago uses OAuth2 client_credentials; use exchangeCredentials() instead of exchangeCode()',
    )
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return pandagoRefreshCredentials(credentials)
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private client(credentials: Credentials): PandagoClient {
    return new PandagoClient(credentials)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = this.client(credentials)

    const body: Record<string, unknown> = {
      payment_method: 'PAID',
      amount: 0,
      description: data.notes ?? 'Delivery',
    }

    if (data.originAddress) {
      body['sender'] = {
        name: data.originAddress.name ?? undefined,
        phone_number: data.originAddress.phone ?? undefined,
        location: {
          address: [
            data.originAddress.street1,
            data.originAddress.street2,
            data.originAddress.city,
            data.originAddress.state,
            data.originAddress.postalCode,
            data.originAddress.country,
          ]
            .filter(Boolean)
            .join(', '),
        },
      }
    }

    if (data.destinationAddress) {
      body['recipient'] = {
        name: data.destinationAddress.name ?? undefined,
        phone_number: data.destinationAddress.phone ?? undefined,
        location: {
          address: [
            data.destinationAddress.street1,
            data.destinationAddress.street2,
            data.destinationAddress.city,
            data.destinationAddress.state,
            data.destinationAddress.postalCode,
            data.destinationAddress.country,
          ]
            .filter(Boolean)
            .join(', '),
        },
      }
    }

    if (data.reference) {
      body['client_order_id'] = data.reference
    }

    const raw = await client.post<PandagoOrder>('/orders', body)
    return transformShipment(raw)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const raw = await this.client(credentials).get<PandagoOrder>(`/orders/${id}`)
    return transformShipment(raw)
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const body: { reason: CancellationReason } = { reason: 'REASON_UNKNOWN' }
    await this.client(credentials).delete<void>(`/orders/${id}`, body)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, orderId: string): Promise<TrackingEvent[]> {
    const raw = await this.client(credentials).get<PandagoOrder>(`/orders/${orderId}`)
    return transformTracking(raw)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = this.client(credentials)

    const sender = {
      name: params.originAddress.name ?? 'Sender',
      phone_number: params.originAddress.phone ?? '',
      location: {
        address: [
          params.originAddress.street1,
          params.originAddress.city,
          params.originAddress.country,
        ]
          .filter(Boolean)
          .join(', '),
      },
    }

    const recipient = {
      name: params.destinationAddress.name ?? 'Recipient',
      phone_number: params.destinationAddress.phone ?? '',
      location: {
        address: [
          params.destinationAddress.street1,
          params.destinationAddress.city,
          params.destinationAddress.country,
        ]
          .filter(Boolean)
          .join(', '),
      },
    }

    const baseRequest = {
      sender,
      recipient,
      payment_method: 'PAID',
      amount: 0,
      description: 'Delivery',
    }

    // Fetch fee and time estimates in parallel; merge into a single Rate.
    const [feeRes, timeRes] = await Promise.allSettled([
      client.post<PandagoEstimate>('/orders/fee', baseRequest),
      client.post<PandagoEstimate>('/orders/time', baseRequest),
    ])

    const fee: PandagoEstimate = feeRes.status === 'fulfilled' ? feeRes.value : {}
    const time: PandagoEstimate = timeRes.status === 'fulfilled' ? timeRes.value : {}

    const merged: PandagoEstimate = { ...fee, ...time }
    return [transformRate(merged)]
  }

  // ── Orders ─────────────────────────────────────────────────────────────────

  async listOrders(_credentials: Credentials, _params: QueryParams): Promise<Order[]> {
    // The spec (on-demand-rider-docs.deliveryhero.io, "On Demand Rider API")
    // has no order collection: under /orders it documents only POST /orders
    // ("Create a New Order") and GET /orders/{order_id} ("Get Specific Order"),
    // plus per-order estimate, cancel, update, coordinates and proof endpoints.
    throw Object.assign(
      new Error(
        'pandago cannot list orders: its API (on-demand-rider-docs.deliveryhero.io) documents no GET /orders, only POST /orders ("Create a New Order") and GET /orders/{order_id} ("Get Specific Order")',
      ),
      { statusCode: 501, code: 'NOT_SUPPORTED' },
    )
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const raw = await this.client(credentials).get<PandagoOrder>(`/orders/${id}`)
    return transformOrder(raw)
  }

  // ── Warehouses (Outlets) ───────────────────────────────────────────────────

  async listWarehouses(credentials: Credentials, params: QueryParams): Promise<Warehouse[]> {
    // GET /outletList ("Get All Outlets") returns every outlet for the parent
    // vendor as one array and takes no paging parameter, so the caller's page
    // is sliced locally.
    const res = await this.client(credentials).get<PandagoOutlet[] | { outlets?: PandagoOutlet[] }>(
      '/outletList',
    )
    const outlets = Array.isArray(res) ? res : (res.outlets ?? [])
    return pageLocally(outlets.map(transformWarehouse), params)
  }

  async getWarehouse(credentials: Credentials, id: string): Promise<Warehouse> {
    // GET /outlets/{client_vendor_id} returns a single outlet.
    const raw = await this.client(credentials).get<PandagoOutlet>(`/outlets/${id}`)
    return transformWarehouse(raw)
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseWebhookEvents(payload)
  }
}
