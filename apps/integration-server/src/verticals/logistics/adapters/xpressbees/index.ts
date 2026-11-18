import { customForm, pageLocally } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
  RateRequestParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Carrier } from '../../schema/carrier'
import type { Order } from '../../schema/order'
import type { Label } from '../../schema/label'
import type { Manifest } from '../../schema/manifest'

import { refreshCredentials as doRefresh, requestToken } from './auth'
import { XpressbeesClient } from './client'

import { transformTracking, type XpressbeesTrackResponse } from './transform/tracking'
import { transformShipment, type XpressbeesShipmentRaw } from './transform/shipment'
import {
  transformCarrier,
  type XpressbeesCourierRaw,
  type XpressbeesCourierListResponse,
} from './transform/carrier'
import { transformOrder, type XpressbeesOrderRaw } from './transform/order'
import { transformLabel, type XpressbeesLabelRaw } from './transform/label'
import { transformManifest, type XpressbeesManifestRaw } from './transform/manifest'

// ── Resource coverage ──────────────────────────────────────────────
// Read (documented): carrier (GET courier), trackingevent (GET shipments2/track/{AWB})
// Refused (501):     listOrders, getOrder, getLabel — no documented read endpoint
// Writes (shipment, order, rate, label, manifest) are unchanged and unverified here.
// Unavailable: warehouse — Xpressbees is a courier-only carrier; no warehouse or pickup-location listing API exists

interface XpressbeesAdapterConfig {
  sandbox?: boolean
}

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

/**
 * The documented auth is "Generate Token": POST /api/users/login with
 * `{ "email", "password" }` (see auth.ts), so the form asks for those two.
 */
const CREDENTIAL_FORM = customForm({
  fields: [
    { name: 'email', label: 'Xpressbees account email', type: 'text', required: true },
    { name: 'password', label: 'Xpressbees account password', type: 'password', required: true },
  ],
  exchange: async (input) => {
    const email = (input?.['email'] ?? '').trim()
    const password = input?.['password'] ?? ''
    if (!email || !password) throw new Error('Xpressbees email and password are required.')
    return requestToken(email, password)
  },
})

/**
 * The published API (https://documenter.getpostman.com/view/15188467/2s9YyzcxWT)
 * has ten requests: Generate Token, Courier List, Order Booking, Reverse
 * Booking, Track Shipment, Generate Manifest/Pickup, Cancel Shipment, Price
 * Calculator/Courier Serviceability, NDR/Exception List and Create
 * NDR/Exception. None lists or reads back orders, shipments or labels.
 */
const NO_ORDER_READ =
  'the Xpressbees API (https://documenter.getpostman.com/view/15188467/2s9YyzcxWT) documents no order list or order lookup; its only read endpoints are Courier List, Track Shipment and NDR/Exception List'

/**
 * "Courier List": GET https://shipment.xpressbees.com/api/courier, "Use This
 * API EndPoint to Get the list of available couriers for your account. No
 * parameters are required". The whole list comes back as `data`, unpaged.
 * An answer without `status: true` and a `data` array is refused rather than
 * read as an empty account.
 */
async function fetchCouriers(client: XpressbeesClient): Promise<XpressbeesCourierRaw[]> {
  const res = await client.get<XpressbeesCourierListResponse>('courier')
  if (res?.status !== true || !Array.isArray(res.data)) {
    throw new Error(
      `Xpressbees courier list failed: ${res?.message ?? 'response has no data array'}`,
    )
  }
  return res.data
}

export class XpressbeesAdapter implements LogisticsAdapter {
  // Connect Link support — email + password, exchanged at users/login.
  credentialFields = CREDENTIAL_FORM.credentialFields
  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  readonly platform = 'xpressbees'
  readonly version = '1'

  constructor(config: XpressbeesAdapterConfig = {}) {
    void config
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  // The only documented auth is "Generate Token" (POST users/login with email
  // and password): there is no OAuth authorize URL and no code to exchange.
  getAuthUrl(_state: string): string {
    throw new Error(
      'Xpressbees has no OAuth flow; it logs in with email and password. Use credentialFields() instead of getAuthUrl().',
    )
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error(
      'Xpressbees has no OAuth flow; it logs in with email and password. Use exchangeCredentials() instead of exchangeCode().',
    )
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  // "Track Shipment": GET https://shipment.xpressbees.com/api/shipments2/track/{AWB},
  // "Just Simply Put the AWB Number in place of {awb}. No other body parameters are required".
  async getTrackingEvents(
    credentials: Credentials,
    trackingNumber: string,
  ): Promise<TrackingEvent[]> {
    const client = new XpressbeesClient(credentials)
    const res = await client.get<XpressbeesTrackResponse>(
      `shipments2/track/${encodeURIComponent(trackingNumber)}`,
    )
    if (!res?.data) {
      throw new Error(`Xpressbees tracking failed: ${res?.message ?? 'response has no data'}`)
    }
    return transformTracking(res.data, trackingNumber)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new XpressbeesClient(credentials)
    const raw = await client.post<XpressbeesShipmentRaw>('shipments', {
      reference: data.reference,
      service_code: data.serviceCode,
      sender: data.originAddress
        ? {
            name: data.originAddress.name,
            company: data.originAddress.company,
            street1: data.originAddress.street1,
            street2: data.originAddress.street2,
            city: data.originAddress.city,
            state: data.originAddress.state,
            postal_code: data.originAddress.postalCode,
            country: data.originAddress.country,
            phone: data.originAddress.phone,
            email: data.originAddress.email,
          }
        : undefined,
      recipient: data.destinationAddress
        ? {
            name: data.destinationAddress.name,
            company: data.destinationAddress.company,
            street1: data.destinationAddress.street1,
            street2: data.destinationAddress.street2,
            city: data.destinationAddress.city,
            state: data.destinationAddress.state,
            postal_code: data.destinationAddress.postalCode,
            country: data.destinationAddress.country,
            phone: data.destinationAddress.phone,
            email: data.destinationAddress.email,
          }
        : undefined,
      weight: data.totalWeight
        ? { value: data.totalWeight.value, unit: data.totalWeight.unit }
        : undefined,
    })
    return transformShipment(raw)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new XpressbeesClient(credentials)
    const pkg = params.packages[0]
    const res = await client.post<{ rates?: Array<Record<string, unknown>> }>('rates', {
      origin: {
        city: params.originAddress.city,
        postal_code: params.originAddress.postalCode,
        country: params.originAddress.country,
      },
      destination: {
        city: params.destinationAddress.city,
        postal_code: params.destinationAddress.postalCode,
        country: params.destinationAddress.country,
      },
      weight: pkg?.weight?.value,
      weight_unit: pkg?.weight?.unit ?? 'kg',
    })
    const list = res.rates ?? []
    return list.map((r) => ({
      carrierId: 'xpressbees',
      serviceCode: (r.service_code as string | undefined) ?? (r.code as string | undefined),
      serviceName: (r.service_name as string | undefined) ?? (r.name as string | undefined),
      currency: (r.currency as string | undefined) ?? 'USD',
      totalAmount:
        typeof r.total === 'number' ? r.total : typeof r.amount === 'number' ? r.amount : undefined,
      transitDays: typeof r.transit_days === 'number' ? r.transit_days : undefined,
      metadata: r as Record<string, unknown>,
    }))
  }

  // ── Carriers ───────────────────────────────────────────────────────────────

  async listCarriers(credentials: Credentials, params: QueryParams): Promise<Carrier[]> {
    const rows = await fetchCouriers(new XpressbeesClient(credentials))
    return pageLocally(rows.map(transformCarrier), params)
  }

  async getCarrier(credentials: Credentials, id: string): Promise<Carrier> {
    const rows = await fetchCouriers(new XpressbeesClient(credentials))
    const match = rows.find((c) => c.id != null && String(c.id) === id)
    if (!match) {
      throw Object.assign(new Error(`Xpressbees carrier not found: ${id}`), { statusCode: 404 })
    }
    return transformCarrier(match)
  }

  // ── Orders ─────────────────────────────────────────────────────────────────

  async listOrders(_credentials: Credentials, _params: QueryParams): Promise<Order[]> {
    throw notSupported(`Xpressbees cannot list orders: ${NO_ORDER_READ}.`)
  }

  async getOrder(_credentials: Credentials, _id: string): Promise<Order> {
    throw notSupported(`Xpressbees cannot read an order: ${NO_ORDER_READ}.`)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new XpressbeesClient(credentials)
    const raw = await client.post<XpressbeesOrderRaw>('shipments2/create', {
      order_id: data.orderNumber ?? `order-${Date.now()}`,
      payment_method: 'Prepaid',
      consigner: data.originAddress
        ? {
            name: data.originAddress.name,
            phone: data.originAddress.phone,
            pincode: data.originAddress.postalCode,
            city: data.originAddress.city,
            state: data.originAddress.state,
            address: data.originAddress.street1,
          }
        : undefined,
      consignee: data.destinationAddress
        ? {
            name: data.destinationAddress.name,
            phone: data.destinationAddress.phone,
            pincode: data.destinationAddress.postalCode,
            city: data.destinationAddress.city,
            state: data.destinationAddress.state,
            address: data.destinationAddress.street1,
          }
        : undefined,
      order_items: (data.lineItems ?? []).map((li) => ({
        name: li.name ?? '',
        qty: li.quantity ?? 1,
        price: li.unitAmount ?? 0,
      })),
      cod_amount: data.totalAmount ?? 0,
      total_amount: data.totalAmount ?? 0,
    })
    return transformOrder(raw)
  }

  async cancelOrder(credentials: Credentials, id: string): Promise<void> {
    const client = new XpressbeesClient(credentials)
    await client.post<unknown>('shipments2/cancel', { awb_numbers: [id] })
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  // Order Booking returns the label URL inline ("label": "https://xb-files.s3.amazonaws.com/labels/...pdf");
  // no documented endpoint reads a label back by id.
  async getLabel(_credentials: Credentials, _id: string): Promise<Label> {
    throw notSupported(
      'Xpressbees cannot read a label: the API (https://documenter.getpostman.com/view/15188467/2s9YyzcxWT) documents no label lookup; the label URL comes back only in the Order Booking response.',
    )
  }

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    const client = new XpressbeesClient(credentials)
    const raw = await client.post<XpressbeesLabelRaw>('shipments2/create_label', {
      awb_number: data.trackingNumber ?? data.id,
    })
    return transformLabel(raw)
  }

  // ── Manifests ──────────────────────────────────────────────────────────────

  async createManifest(credentials: Credentials, data: Partial<Manifest>): Promise<Manifest> {
    const client = new XpressbeesClient(credentials)
    const awbNumbers = data.shipmentIds ?? []
    const raw = await client.post<XpressbeesManifestRaw>('shipments2/manifests', {
      awb_numbers: awbNumbers,
    })
    return transformManifest(raw, awbNumbers)
  }
}
