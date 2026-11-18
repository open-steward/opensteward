import { simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  RateRequestParams,
} from '../../adapter/interface'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Shipment } from '../../schema/shipment'
import type { Order } from '../../schema/order'
import type { Rate } from '../../schema/rate'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { SFExpressClient } from './client'

import { transformTracking, type SFTrackingResponse } from './transform/tracking'
import { transformShipment, type SFOrderResult } from './transform/shipment'
import { transformOrder } from './transform/order'
import { transformRates, type SFDeliverTmResponse } from './transform/rate'

// ── Resource coverage ──────────────────────────────────────────────────────
// Unavailable: carrier   — SF Express is the sole carrier; no carrier-list API exists
// Unavailable: manifest  — No manifest/end-of-day concept in the SF Express Fengqiao API
// Unavailable: warehouse — No warehouse management API in the SF Express Fengqiao API
// Unverified:  label     — COM_RECE_CLOUD_PRINT_WAYBILLS exists in SDK but response
//                          field names (label URL / base64 content key) are not
//                          confirmed by any public authoritative documentation

interface SFExpressAdapterConfig {
  partnerId?: string
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class SFExpressAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'sf-express'
  readonly version = '1'
  private partnerId: string | undefined

  constructor(_config: SFExpressAdapterConfig = {}) {
    this.partnerId = _config.partnerId
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return exchangeApiKey(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new SFExpressClient(credentials, this.partnerId)
    const raw = await client.request<SFTrackingResponse>('EXP_RECE_SEARCH_ROUTES', {
      trackingType: '1',
      trackingNumber: [trackingNumber],
      methodType: '1',
    })
    return transformTracking(raw, trackingNumber)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new SFExpressClient(credentials, this.partnerId)
    const raw = await client.request<SFOrderResult>('EXP_RECE_CREATE_ORDER', {
      orderId: data.id ?? data.reference ?? String(Date.now()),
      isReturnRouteLabel: 1,
      ...(data.metadata ?? {}),
    })
    return transformShipment(raw)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new SFExpressClient(credentials, this.partnerId)
    const raw = await client.request<SFOrderResult>('EXP_RECE_SEARCH_ORDER_RESP', {
      orderId: id,
    })
    return transformShipment(raw)
  }

  // ── Orders ─────────────────────────────────────────────────────────────────

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new SFExpressClient(credentials, this.partnerId)
    const raw = await client.request<SFOrderResult>('EXP_RECE_CREATE_ORDER', {
      orderId: data.id ?? data.orderNumber ?? String(Date.now()),
      isReturnRouteLabel: 1,
      ...(data.metadata ?? {}),
    })
    return transformOrder(raw)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new SFExpressClient(credentials, this.partnerId)
    const raw = await client.request<SFOrderResult>('EXP_RECE_SEARCH_ORDER_RESP', {
      orderId: id,
    })
    return transformOrder(raw)
  }

  async cancelOrder(credentials: Credentials, id: string): Promise<void> {
    const client = new SFExpressClient(credentials, this.partnerId)
    await client.request('EXP_RECE_UPDATE_ORDER', {
      orderId: id,
      dealType: 2, // 2 = cancel
    })
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new SFExpressClient(credentials, this.partnerId)
    const raw = await client.request<SFDeliverTmResponse>('EXP_RECE_QUERY_DELIVERTM', {
      searchPrice: '1',
      srcAddress: {
        province: params.originAddress.state,
        city: params.originAddress.city,
        address: params.originAddress.street1,
        code: (params.originAddress as Record<string, unknown>).code,
      },
      destAddress: {
        province: params.destinationAddress.state,
        city: params.destinationAddress.city,
        address: params.destinationAddress.street1,
        code: (params.destinationAddress as Record<string, unknown>).code,
      },
      weight: params.packages.reduce((s, p) => s + (p.weight?.value ?? 0), 0),
    })
    return transformRates(raw)
  }
}
