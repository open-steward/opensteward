import { connectionScope, pageByRows, pageLocally, simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
  RateRequestParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { Order } from '../../schema/order'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Label } from '../../schema/label'
import type { WebhookEvent } from '../../schema/webhook'
import type { Carrier } from '../../schema/carrier'
import type { Manifest } from '../../schema/manifest'
import type { Warehouse } from '../../schema/warehouse'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { ShippyProClient } from './client'

import {
  transformShipment,
  transformReportShipment,
  transformOrderDetailShipment,
  type ShippyProShipment,
  type ShippyProReportShipment,
  type ShippyProOrderDetail,
} from './transform/shipment'
import { transformRate, type ShippyProRate } from './transform/rate'
import { transformLabel, transformLabelUrl, type ShippyProLabelUrl } from './transform/label'
import { transformTracking, type ShippyProTracking } from './transform/tracking'
import { transformOrder, transformOrderDetail, type ShippyProOrder } from './transform/order'
import { transformCarriers, type ShippyProCarriersResponse } from './transform/carrier'
import { transformManifest, type ShippyProManifest } from './transform/manifest'

const DAY_SECONDS = 86_400

/** A 501 NOT_SUPPORTED refusal, thrown before any request is sent. */
function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

/**
 * `GetOrder` and `GetLabelUrl` take the ShippyPro Order ID as an integer:
 * "OrderID":{"type":"integer","description":"ShippyPro Order ID."}.
 */
function orderIdParam(id: string): number {
  if (!/^\d+$/.test(id)) {
    throw Object.assign(
      new Error(`ShippyPro order ids are integers (ShippyPro Order ID); got "${id}"`),
      { statusCode: 400, code: 'VALIDATION' },
    )
  }
  return Number(id)
}

interface ShippyProAdapterConfig {
  // Reserved for future configuration options
  _placeholder?: never
}

const SIMPLE_API_KEY_FORM = simpleApiKey({
  label: 'API key',
  helpText: 'Find your API key in the ShippyPro panel under Integrations & API.',
})

export class ShippyProAdapter implements LogisticsAdapter {
  // Connect Link support — single API-key form.
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'shippypro'
  readonly version = '1'

  constructor(_config: ShippyProAdapterConfig = {}) {}

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // For ShippyPro the "code" is the API key itself.
    return exchangeApiKey(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Webhook ────────────────────────────────────────────────────────────────
  // ShippyPro does not document a webhook signing scheme.  Custom header
  // authentication is supported at the webhook server level, but there is no
  // HMAC secret to verify.  We therefore implement only parseWebhookEvents.

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    // ShippyPro webhook events include a top-level "EventType" (or similar)
    // field indicating what happened. Known types: TRACKING_UPDATE, ORDER_SHIPPED,
    // ORDER_ERROR. We normalise these to canonical resource/action pairs.
    const eventType = String(payload['EventType'] ?? payload['event_type'] ?? '')
    const trackingNumber = payload['TrackingNumber'] ?? payload['tracking_number']
    const orderId = payload['OrderId'] ?? payload['order_id']
    const resourceId = String(orderId ?? trackingNumber ?? '')

    type CanonicalResource = WebhookEvent['resourceType']
    type CanonicalAction = WebhookEvent['action']

    let resourceType: CanonicalResource = 'shipment'
    let action: CanonicalAction = 'updated'

    switch (eventType.toUpperCase()) {
      case 'TRACKING_UPDATE':
        resourceType = 'tracking_event'
        action = 'updated'
        break
      case 'ORDER_SHIPPED':
        resourceType = 'shipment'
        action = 'updated'
        break
      case 'ORDER_ERROR':
        resourceType = 'shipment'
        action = 'updated'
        break
      case 'ORDER_CREATED':
        resourceType = 'order'
        action = 'created'
        break
      case 'ORDER_CANCELLED':
      case 'ORDER_CANCELED':
        resourceType = 'order'
        action = 'cancelled'
        break
      default:
        resourceType = 'shipment'
        action = 'updated'
    }

    return [
      {
        platform: 'shippypro',
        type: eventType || 'unknown',
        resourceType,
        action,
        resourceId: resourceId || undefined,
        payload,
      },
    ]
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  /**
   * `GetShipmentsReport` ("Returns the list of shipments in the specified
   * timeframe"), https://api.shippypro.com/docs/v1.json. Its params are
   * `"required":["DateMin","DateMax"]` ("Filter date from, Unix timestamp in
   * seconds (10 digits).") plus `Return`, `IncludeItems` and
   * `ShowHiddenShipments`: no page, limit or cursor. So the method walks UTC
   * calendar days newest-first, one request per day, and cuts the caller's
   * pages out of them with pageByRows.
   *
   * The walk's lower bound is `updatedAfter`. The docs state no retention or
   * lookback limit, so a call without it has no bound and is refused.
   */
  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const after = params.updatedAfter
    if (!after) {
      throw notSupported(
        'ShippyPro cannot list shipments without a date window: GetShipmentsReport requires ' +
          '"DateMin" and "DateMax" ("required":["DateMin","DateMax"]) and has no page, limit or ' +
          'cursor, and ShippyPro documents no retention limit to bound a full walk. ' +
          'Pass updated_after to list the shipments dated since then.',
      )
    }
    const floor = Math.floor(after.getTime() / 1000)
    const today = Math.floor(Date.now() / 1000 / DAY_SECONDS) * DAY_SECONDS
    const client = new ShippyProClient(credentials)
    const key = `${connectionScope('shippypro', credentials)}::shipments-report::after=${floor}&today=${today}`
    const windows = Math.max(1, Math.ceil((today - floor) / DAY_SECONDS) + 1)
    const { items } = await pageByRows<Shipment, number>(
      key,
      params,
      async (cursor) => {
        const dayStart = cursor ?? today
        const dateMax = dayStart + DAY_SECONDS - 1
        if (floor > dateMax) return { items: [], next: undefined }
        const res = await client.call<{ Shipments?: ShippyProReportShipment[] | null }>(
          'GetShipmentsReport',
          { DateMin: Math.max(dayStart, floor), DateMax: dateMax },
        )
        return {
          items: (res.Shipments ?? []).map(transformReportShipment),
          next: dayStart > floor ? dayStart - DAY_SECONDS : undefined,
        }
      },
      { maxUpstreamPages: windows + 1 },
    )
    return items
  }

  /** `GetOrder` ("Retrieves order or shipment details"), by ShippyPro `OrderID`. */
  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const raw = await this.fetchOrderDetail(credentials, id)
    return transformOrderDetailShipment(raw)
  }

  private async fetchOrderDetail(
    credentials: Credentials,
    id: string,
  ): Promise<ShippyProOrderDetail> {
    const orderId = orderIdParam(id)
    const client = new ShippyProClient(credentials)
    const raw = await client.call<ShippyProOrderDetail>('GetOrder', { OrderID: orderId })
    if (!raw.OrderID) {
      const why = typeof raw['ErrorMessage'] === 'string' ? `: ${raw['ErrorMessage']}` : ''
      throw new Error(`ShippyPro GetOrder returned no order for OrderID ${orderId}${why}`)
    }
    return raw
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new ShippyProClient(credentials)
    const raw = await client.call<ShippyProShipment>('Ship', {
      Reference: data.reference,
      ToAddress: data.destinationAddress
        ? {
            Name: data.destinationAddress.name,
            Company: data.destinationAddress.company,
            Street1: data.destinationAddress.street1,
            Street2: data.destinationAddress.street2,
            City: data.destinationAddress.city,
            State: data.destinationAddress.state,
            Zip: data.destinationAddress.postalCode,
            Country: data.destinationAddress.country,
            Phone: data.destinationAddress.phone,
            Email: data.destinationAddress.email,
          }
        : undefined,
      FromAddress: data.originAddress
        ? {
            Name: data.originAddress.name,
            Company: data.originAddress.company,
            Street1: data.originAddress.street1,
            Street2: data.originAddress.street2,
            City: data.originAddress.city,
            State: data.originAddress.state,
            Zip: data.originAddress.postalCode,
            Country: data.originAddress.country,
            Phone: data.originAddress.phone,
            Email: data.originAddress.email,
          }
        : undefined,
      Parcels: data.totalWeight
        ? [{ Weight: data.totalWeight.value, WeightUnit: data.totalWeight.unit }]
        : undefined,
    })
    return transformShipment(raw)
  }

  // ── Orders ─────────────────────────────────────────────────────────────────

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const raw = await this.fetchOrderDetail(credentials, id)
    return transformOrderDetail(raw)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new ShippyProClient(credentials)
    const raw = await client.call<ShippyProOrder>('Ship', {
      Reference: data.orderNumber,
      ToAddress: data.destinationAddress
        ? {
            Name: data.destinationAddress.name,
            Company: data.destinationAddress.company,
            Street1: data.destinationAddress.street1,
            Street2: data.destinationAddress.street2,
            City: data.destinationAddress.city,
            State: data.destinationAddress.state,
            Zip: data.destinationAddress.postalCode,
            Country: data.destinationAddress.country,
            Phone: data.destinationAddress.phone,
            Email: data.destinationAddress.email,
          }
        : undefined,
      FromAddress: data.originAddress
        ? {
            Name: data.originAddress.name,
            Company: data.originAddress.company,
            Street1: data.originAddress.street1,
            Street2: data.originAddress.street2,
            City: data.originAddress.city,
            State: data.originAddress.state,
            Zip: data.originAddress.postalCode,
            Country: data.originAddress.country,
            Phone: data.originAddress.phone,
            Email: data.originAddress.email,
          }
        : undefined,
    })
    return transformOrder(raw as ShippyProOrder)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  /**
   * `GetTracking`: `"required":["Code"]`, "Code": "Tracking number."
   */
  async getTrackingEvents(
    credentials: Credentials,
    trackingNumber: string,
  ): Promise<TrackingEvent[]> {
    const client = new ShippyProClient(credentials)
    const raw = await client.call<ShippyProTracking>('GetTracking', { Code: trackingNumber })
    return transformTracking(raw, trackingNumber)
  }

  /**
   * ShippyPro documents no list of tracking events. `GetTracking` answers
   * for one tracking number and says "⚠️ This method is not recommended for
   * bulk usage. To receive all the trackings updates please setup a Webhook
   * instead."
   */
  async listTrackingEvents(
    _credentials: Credentials,
    _params: QueryParams,
  ): Promise<TrackingEvent[]> {
    throw notSupported(
      'ShippyPro cannot list tracking events: GetTracking takes one tracking number ' +
        '("required":["Code"]) and "is not recommended for bulk usage. To receive all the ' +
        'trackings updates please setup a Webhook instead."',
    )
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new ShippyProClient(credentials)
    const res = await client.call<{ Rates?: ShippyProRate[] }>('GetRates', {
      ToAddress: {
        Name: params.destinationAddress.name,
        Street1: params.destinationAddress.street1,
        Street2: params.destinationAddress.street2,
        City: params.destinationAddress.city,
        State: params.destinationAddress.state,
        Zip: params.destinationAddress.postalCode,
        Country: params.destinationAddress.country,
      },
      FromAddress: {
        Name: params.originAddress.name,
        Street1: params.originAddress.street1,
        Street2: params.originAddress.street2,
        City: params.originAddress.city,
        State: params.originAddress.state,
        Zip: params.originAddress.postalCode,
        Country: params.originAddress.country,
      },
      Parcels: params.packages.map((pkg) => ({
        Weight: pkg.weight?.value,
        WeightUnit: pkg.weight?.unit,
        Length: pkg.dimensions?.length,
        Width: pkg.dimensions?.width,
        Height: pkg.dimensions?.height,
        DimensionUnit: pkg.dimensions?.unit,
      })),
    })
    return (res.Rates ?? []).map(transformRate)
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  /**
   * `GetLabelUrl` ("Retrieves order labels and tracking info"), by ShippyPro
   * `OrderID`. Its "LabelURL" is "An empty array (`[]`) when the order is in
   * error".
   */
  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    const orderId = orderIdParam(id)
    const client = new ShippyProClient(credentials)
    const raw = await client.call<ShippyProLabelUrl>('GetLabelUrl', { OrderID: orderId })
    const label = transformLabelUrl(String(orderId), raw)
    if (!label.url && !label.base64) {
      throw new Error(`No label found on ShippyPro order ${orderId}`)
    }
    return label
  }

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    if (!data.shipmentId) throw new Error('shipmentId is required to create a label')
    const client = new ShippyProClient(credentials)
    // For ShippyPro, creating a label is synonymous with creating a shipment.
    // Re-ship the order to obtain/regenerate the label.
    const raw = await client.call<ShippyProShipment>('Ship', {
      OrderId: data.shipmentId,
    })
    if (!raw.LabelUrl) {
      throw new Error(`Label creation did not return a LabelUrl for order ${data.shipmentId}`)
    }
    return transformLabel(raw)
  }

  async voidLabel(credentials: Credentials, id: string): Promise<void> {
    const client = new ShippyProClient(credentials)
    // ShippyPro: delete/cancel an order to void the associated label.
    await client.call<unknown>('DeleteOrder', { OrderId: id })
  }

  // ── Carriers ───────────────────────────────────────────────────────────────

  /**
   * `GetCarriers`: "the list of connected carriers and their details in your
   * ShippyPro account". Its params say "All fields are optional; send an empty
   * object to list every carrier.", and none pages, so the whole list comes
   * back at once and is paged here.
   */
  async listCarriers(credentials: Credentials, params: QueryParams): Promise<Carrier[]> {
    const client = new ShippyProClient(credentials)
    const res = await client.call<ShippyProCarriersResponse>('GetCarriers', {})
    return pageLocally(transformCarriers(res), params)
  }

  // ── Manifests ─────────────────────────────────────────────────────────────

  /**
   * ShippyPro documents no manifest list: `GetManifest` ("Retrieve Manifest
   * documents") takes one `"required":["ManifestNumber"]`.
   */
  async listManifests(_credentials: Credentials, _params: QueryParams): Promise<Manifest[]> {
    throw notSupported(
      'ShippyPro cannot list manifests: its only manifest read, GetManifest, retrieves one ' +
        'manifest by number ("required":["ManifestNumber"]).',
    )
  }

  async createManifest(credentials: Credentials, data: Partial<Manifest>): Promise<Manifest> {
    const client = new ShippyProClient(credentials)
    const raw = await client.call<ShippyProManifest>('CreateManifest', {
      CarrierCode: data.carrierId,
      Orders: data.shipmentIds,
    })
    return transformManifest(raw)
  }

  // ── Warehouses ─────────────────────────────────────────────────────────────

  /**
   * ShippyPro documents no warehouse or ship-from location resource: none of
   * the 55 v1 methods (https://api.shippypro.com/docs/v1.json) reads one.
   */
  async listWarehouses(_credentials: Credentials, _params: QueryParams): Promise<Warehouse[]> {
    throw notSupported(
      'ShippyPro cannot list warehouses: its API (https://api.shippypro.com/docs/v1.json) ' +
        'has no warehouse or ship-from location method.',
    )
  }
}
