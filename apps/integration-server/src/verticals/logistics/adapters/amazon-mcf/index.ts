import type { LogisticsAdapter, Credentials, RateRequestParams } from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { Order } from '../../schema/order'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'

import {
  buildAuthUrl,
  exchangeCode as doExchange,
  refreshCredentials as doRefresh,
  ensureAuth,
  type AmazonMcfAuthConfig,
} from './auth'
import { AmazonMcfClient } from './client'
import { transformTracking, type McfTrackingResponse } from './transform/tracking'
import { transformShipment, type McfShipment } from './transform/shipment'
import { transformOrder, type McfOrder } from './transform/order'
import {
  transformFulfillmentPreviews,
  type McfFulfillmentPreviewResponse,
} from './transform/rate'

// ── Resource coverage ──────────────────────────────────────────────
// Available:   order, shipment, trackingevent, rate
// Unavailable: carrier — MCF manages carrier selection internally; no carrier listing endpoint in FBA Outbound API
// Unavailable: label   — MCF handles label printing internally; no label generation endpoint exposed via SP-API
// Unavailable: manifest — MCF manages carrier pickup manifests internally; no manifest endpoint in FBA Outbound API
// Unavailable: warehouse — No fulfillment center listing in FBA Outbound API; Merchant Fulfillment API is a separate service

interface AmazonMcfAdapterConfig {
  clientId?: string
  clientSecret?: string
  sandbox?: boolean
}

/**
 * Amazon Multi-Channel Fulfillment (MCF) adapter — order-driven fulfillment
 * via SP-API FBA Outbound v2020-07-01.
 */
export class AmazonMcfAdapter implements LogisticsAdapter {
  readonly platform = 'amazon-mcf'
  readonly version = '2020-07-01'

  constructor(private config: AmazonMcfAdapterConfig = {}) {}

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    const cfg: AmazonMcfAuthConfig = {
      clientId: this.config.clientId ?? '',
      clientSecret: this.config.clientSecret ?? '',
      sandbox: this.config.sandbox,
    }
    return doExchange(code, redirectUri, cfg)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(
    credentials: Credentials,
    trackingNumber: string,
  ): Promise<TrackingEvent[]> {
    const creds = await ensureAuth(credentials)
    const client = new AmazonMcfClient(creds)
    // MCF tracks by fulfillment order id rather than raw tracking number.
    const raw = await client.get<McfTrackingResponse>(
      `fulfillmentOrders/${encodeURIComponent(trackingNumber)}/tracking`,
    )
    return transformTracking(raw)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const creds = await ensureAuth(credentials)
    const client = new AmazonMcfClient(creds)
    // MCF doesn't expose a direct "create shipment" endpoint — shipments are
    // produced by MCF when a fulfillment order is accepted. We proxy to the
    // fulfillment order create endpoint and return the resulting shipment.
    const raw = await client.post<McfShipment>('fulfillmentOrders', {
      sellerFulfillmentOrderId: data.reference,
      shippingSpeedCategory: data.serviceCode,
      destinationAddress: data.destinationAddress
        ? {
            name: data.destinationAddress.name,
            addressLine1: data.destinationAddress.street1,
            addressLine2: data.destinationAddress.street2,
            city: data.destinationAddress.city,
            stateOrRegion: data.destinationAddress.state,
            postalCode: data.destinationAddress.postalCode,
            countryCode: data.destinationAddress.country,
            phone: data.destinationAddress.phone,
          }
        : undefined,
    })
    return transformShipment(raw)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const creds = await ensureAuth(credentials)
    const client = new AmazonMcfClient(creds)
    const raw = await client.post<McfFulfillmentPreviewResponse>(
      'fulfillmentOrders/preview',
      {
        address: {
          name: params.destinationAddress.name,
          addressLine1: params.destinationAddress.street1,
          addressLine2: params.destinationAddress.street2,
          city: params.destinationAddress.city,
          stateOrRegion: params.destinationAddress.state,
          postalCode: params.destinationAddress.postalCode,
          countryCode: params.destinationAddress.country,
          phone: params.destinationAddress.phone,
        },
        items: params.packages.map((pkg, idx) => ({
          sellerSku: pkg.reference ?? `pkg-${idx}`,
          sellerFulfillmentOrderItemId: pkg.id ?? `pkg-${idx}`,
          quantity: 1,
          weight: pkg.weight
            ? { value: pkg.weight.value, unit: pkg.weight.unit?.toUpperCase() }
            : undefined,
        })),
        shippingSpeedCategories: params.serviceCodes ?? [
          'Standard',
          'Expedited',
          'Priority',
          'ScheduledDelivery',
        ],
      },
    )
    return transformFulfillmentPreviews(raw)
  }

  // ── Orders ─────────────────────────────────────────────────────────────────

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const creds = await ensureAuth(credentials)
    const client = new AmazonMcfClient(creds)
    const raw = await client.get<McfOrder>(
      `fulfillmentOrders/${encodeURIComponent(id)}`,
    )
    return transformOrder(raw)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const creds = await ensureAuth(credentials)
    const client = new AmazonMcfClient(creds)
    const raw = await client.post<McfOrder>('fulfillmentOrders', {
      sellerFulfillmentOrderId: data.id ?? data.orderNumber,
      displayableOrderId: data.orderNumber,
      displayableOrderDate: data.orderAt?.toISOString(),
      displayableOrderComment: data.notes,
      shippingSpeedCategory: data.requestedServiceCode,
      destinationAddress: data.destinationAddress
        ? {
            name: data.destinationAddress.name,
            addressLine1: data.destinationAddress.street1,
            addressLine2: data.destinationAddress.street2,
            city: data.destinationAddress.city,
            stateOrRegion: data.destinationAddress.state,
            postalCode: data.destinationAddress.postalCode,
            countryCode: data.destinationAddress.country,
            phone: data.destinationAddress.phone,
          }
        : undefined,
      items: (data.lineItems ?? []).map((li, idx) => ({
        sellerSku: li.sku,
        sellerFulfillmentOrderItemId: li.id ?? `item-${idx}`,
        quantity: li.quantity ?? 1,
        displayableComment: li.description,
        perUnitDeclaredValue:
          li.unitAmount != null ? { value: li.unitAmount, currencyCode: 'USD' } : undefined,
      })),
    })
    return transformOrder(raw)
  }
}
