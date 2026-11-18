import { simpleApiKey } from '@opensteward/shared'
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

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { GigLogisticsClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformShipment, type GigShipment } from './transform/shipment'
import { transformTracker, type GigTracker } from './transform/tracking'
import { transformRate, type GigRate } from './transform/rate'
import { transformLabel, type GigLabel } from './transform/label'
import { transformOrder, type GigOrder } from './transform/order'

const SIMPLE_API_KEY_FORM = simpleApiKey()

// ── Resource coverage ──────────────────────────────────────────────
// Unverified: carrier   — developer portal (giglogistics.com/developer/) returns HTTP 403; no public API spec documents a /carriers listing endpoint
// Unverified: manifest  — developer portal returns HTTP 403; no manifest or end-of-day close-out endpoint is referenced in any publicly accessible documentation
// Unverified: warehouse — GIG Logistics offers warehousing services but developer portal returns HTTP 403; no warehouse listing endpoint is documented publicly

/**
 * GIG Logistics (GIGL) adapter for OpenSteward.
 *
 * GIG Logistics is Africa's leading logistics provider, operating primarily in
 * Nigeria and across West Africa. The API supports shipment (waybill) creation,
 * real-time tracking, rate enquiry, label generation, and order management.
 *
 * Authentication: API key passed in the `x-api-key` HTTP header.
 * Docs: https://giglogistics.com/developer/
 */
export class GigLogisticsAdapter implements LogisticsAdapter {
  readonly platform = 'gig-logistics'
  readonly version = '1'

  // Connect Link support — single API-key form
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

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

  // ── Shipments ──────────────────────────────────────────────────────────────

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new GigLogisticsClient(credentials)
    const pageSize = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<{ data: GigShipment[] } | GigShipment[]>('shipments', {
      pageSize,
      page: 1,
    })
    const items = Array.isArray(res) ? res : ((res as { data?: GigShipment[] }).data ?? [])
    return items.map(transformShipment)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new GigLogisticsClient(credentials)
    const res = await client.get<{ data: GigShipment } | GigShipment>(`shipments/${id}`)
    const raw = (res as { data?: GigShipment }).data ?? (res as GigShipment)
    return transformShipment(raw)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new GigLogisticsClient(credentials)
    const body: Record<string, unknown> = {}

    if (data.originAddress) {
      body.senderDetail = {
        name: data.originAddress.name,
        phoneNumber: data.originAddress.phone,
        email: data.originAddress.email,
        address: data.originAddress.street1,
        addressLine2: data.originAddress.street2,
        city: data.originAddress.city,
        state: data.originAddress.state,
        country: data.originAddress.country,
        postalCode: data.originAddress.postalCode,
      }
    }
    if (data.destinationAddress) {
      body.receiverDetail = {
        name: data.destinationAddress.name,
        phoneNumber: data.destinationAddress.phone,
        email: data.destinationAddress.email,
        address: data.destinationAddress.street1,
        addressLine2: data.destinationAddress.street2,
        city: data.destinationAddress.city,
        state: data.destinationAddress.state,
        country: data.destinationAddress.country,
        postalCode: data.destinationAddress.postalCode,
      }
    }
    if (data.totalWeight) {
      body.weight = data.totalWeight.value
      body.weightUnit = data.totalWeight.unit
    }
    if (data.reference) {
      body.referenceNumber = data.reference
    }
    if (data.notes) {
      body.description = data.notes
    }
    if (data.serviceCode) {
      body.serviceCode = data.serviceCode
    }

    const res = await client.post<{ data: GigShipment } | GigShipment>('shipments', body)
    const raw = (res as { data?: GigShipment }).data ?? (res as GigShipment)
    return transformShipment(raw)
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new GigLogisticsClient(credentials)
    await client.put<unknown>(`shipments/${id}/cancel`, {})
  }

  // ── Orders ─────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new GigLogisticsClient(credentials)
    const pageSize = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<{ data: GigOrder[] } | GigOrder[]>('orders', {
      pageSize,
      page: 1,
    })
    const items = Array.isArray(res) ? res : ((res as { data?: GigOrder[] }).data ?? [])
    return items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new GigLogisticsClient(credentials)
    const res = await client.get<{ data: GigOrder } | GigOrder>(`orders/${id}`)
    const raw = (res as { data?: GigOrder }).data ?? (res as GigOrder)
    return transformOrder(raw)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new GigLogisticsClient(credentials)
    const body: Record<string, unknown> = {}

    if (data.orderNumber) body.orderNumber = data.orderNumber
    if (data.customerId) body.customerId = data.customerId
    if (data.notes) body.notes = data.notes
    if (data.requestedServiceCode) body.serviceCode = data.requestedServiceCode

    if (data.originAddress) {
      body.senderDetail = {
        name: data.originAddress.name,
        phoneNumber: data.originAddress.phone,
        email: data.originAddress.email,
        address: data.originAddress.street1,
        city: data.originAddress.city,
        state: data.originAddress.state,
        country: data.originAddress.country,
      }
    }
    if (data.destinationAddress) {
      body.receiverDetail = {
        name: data.destinationAddress.name,
        phoneNumber: data.destinationAddress.phone,
        email: data.destinationAddress.email,
        address: data.destinationAddress.street1,
        city: data.destinationAddress.city,
        state: data.destinationAddress.state,
        country: data.destinationAddress.country,
      }
    }

    const res = await client.post<{ data: GigOrder } | GigOrder>('orders', body)
    const raw = (res as { data?: GigOrder }).data ?? (res as GigOrder)
    return transformOrder(raw)
  }

  async cancelOrder(credentials: Credentials, id: string): Promise<void> {
    const client = new GigLogisticsClient(credentials)
    await client.put<unknown>(`orders/${id}/cancel`, {})
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new GigLogisticsClient(credentials)
    const res = await client.get<{ data: GigTracker } | GigTracker>(
      `tracking/${trackingNumber}`,
    )
    const raw = (res as { data?: GigTracker }).data ?? (res as GigTracker)
    return transformTracker(raw)
  }

  async listTrackingEvents(credentials: Credentials, params: QueryParams): Promise<TrackingEvent[]> {
    const client = new GigLogisticsClient(credentials)
    const pageSize = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<{ data: GigTracker[] } | GigTracker[]>('tracking', {
      pageSize,
      page: 1,
    })
    const items = Array.isArray(res) ? res : ((res as { data?: GigTracker[] }).data ?? [])
    return items.flatMap(transformTracker)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new GigLogisticsClient(credentials)
    const body: Record<string, unknown> = {
      originState: params.originAddress.state,
      originCity: params.originAddress.city,
      originCountry: params.originAddress.country,
      destinationState: params.destinationAddress.state,
      destinationCity: params.destinationAddress.city,
      destinationCountry: params.destinationAddress.country,
      weight: params.packages[0]?.weight?.value,
      weightUnit: params.packages[0]?.weight?.unit,
    }

    const res = await client.post<{ data: GigRate[] } | GigRate[]>('rates/enquiry', body)
    const items = Array.isArray(res) ? res : ((res as { data?: GigRate[] }).data ?? [])
    return items.map(transformRate)
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    const client = new GigLogisticsClient(credentials)
    const res = await client.get<{ data: GigLabel } | GigLabel>(`labels/${id}`)
    const raw = (res as { data?: GigLabel }).data ?? (res as GigLabel)
    return transformLabel(raw)
  }

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    if (!data.shipmentId) throw new Error('shipmentId is required to create a label')
    const client = new GigLogisticsClient(credentials)
    const res = await client.post<{ data: GigLabel } | GigLabel>(
      `shipments/${data.shipmentId}/label`,
      { format: data.format ?? 'PDF' },
    )
    const raw = (res as { data?: GigLabel }).data ?? (res as GigLabel)
    return transformLabel(raw, data.shipmentId, data.trackingNumber)
  }

  async voidLabel(credentials: Credentials, id: string): Promise<void> {
    const client = new GigLogisticsClient(credentials)
    await client.put<unknown>(`labels/${id}/void`, {})
  }
}
