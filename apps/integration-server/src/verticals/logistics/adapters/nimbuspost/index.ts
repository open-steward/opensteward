// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: label — no dedicated label endpoint; labels are accessible
//              only as label_url on shipment objects (no list/get/create/void)
import { pageLocally, simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  RateRequestParams,
} from '../../adapter/interface'
import type { QueryParams } from '@opensteward/shared'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Carrier } from '../../schema/carrier'
import type { Order } from '../../schema/order'
import type { Warehouse } from '../../schema/warehouse'
import type { Manifest } from '../../schema/manifest'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { NimbusPostClient } from './client'

import { transformTracking, type NimbusPostTrackingResponse } from './transform/tracking'
import { transformShipment, type NimbusPostShipmentRaw } from './transform/shipment'
import {
  transformCarrier,
  type NimbusPostCourierRaw,
  type NimbusPostCourierListResponse,
} from './transform/carrier'
import { transformManifest, type NimbusPostManifestRaw } from './transform/manifest'
import { transformRate, type NimbusPostRateRaw } from './transform/rate'

interface NimbusPostAdapterConfig { sandbox?: boolean }
const SIMPLE_API_KEY_FORM = simpleApiKey()

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

export class NimbusPostAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'nimbuspost'
  readonly version = '1'

  constructor(config: NimbusPostAdapterConfig = {}) {

    void config
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

  // ── Carriers ───────────────────────────────────────────────────────────────
  // GET /courier — list courier partners enabled for the account
  // Docs: https://documenter.getpostman.com/view/9692837/TW6wHnoz#2665632a-c9b6-419b-a696-dc599f3affa1
  // Unpaginated: "Use this API endpoint to Get the list of available couriers
  // for your account. No parameters are required." One response is the whole
  // collection, so it is paged locally.

  async listCarriers(credentials: Credentials, params: QueryParams): Promise<Carrier[]> {
    const client = new NimbusPostClient(credentials)
    const res = await client.get<NimbusPostCourierListResponse>('courier')
    const list: NimbusPostCourierRaw[] = Array.isArray(res.data)
      ? res.data
      : Array.isArray(res)
        ? (res as unknown as NimbusPostCourierRaw[])
        : []
    return pageLocally(list.map(transformCarrier), params)
  }

  // ── Orders and warehouses: refused ─────────────────────────────────────────
  // The Partners API this client targets (https://api.nimbuspost.com/v1,
  // https://documenter.getpostman.com/view/9692837/TW6wHnoz) has no orders or
  // warehouse route. They are documented only on the separate Ship API
  // (https://documenter.getpostman.com/view/9692837/SWE6beC7, NP-API-KEY header):
  //   GET https://ship.nimbuspost.com/api/orders       (#56be4ac5-b5d3-4fb5-82e0-04990447cfc7)
  //   GET https://ship.nimbuspost.com/api/orders/{id}  (#c8a87162-3088-4fb2-a1fe-8c634361f5b7)
  //   GET https://ship.nimbuspost.com/api/warehouse    (#42d8f354-c80a-47d9-9e51-49ac513818c5)
  // None of the three documents a response: no example, no field table. With
  // no documented source for an id or any other field, rows cannot be mapped
  // without guessing, so these refuse before sending anything.

  async listOrders(_credentials: Credentials, _params: QueryParams): Promise<Order[]> {
    throw notSupported(
      'NimbusPost cannot list orders: the only documented orders list is GET https://ship.nimbuspost.com/api/orders ' +
        '(Ship API, NP-API-KEY), whose docs say only "This API will list orders from your Nimbuspost account." ' +
        'and give no response fields or example, so its rows cannot be mapped',
    )
  }

  async getOrder(_credentials: Credentials, _id: string): Promise<Order> {
    throw notSupported(
      'NimbusPost cannot read orders: GET https://ship.nimbuspost.com/api/orders/{id} (Ship API, NP-API-KEY) ' +
        'documents no response fields or example ("Get the order details of a particular order through this API ' +
        'by passing the Nimbuspost order id"), so the order cannot be mapped',
    )
  }

  async listWarehouses(_credentials: Credentials, _params: QueryParams): Promise<Warehouse[]> {
    throw notSupported(
      'NimbusPost cannot list warehouses: the only documented list is GET https://ship.nimbuspost.com/api/warehouse ' +
        '(Ship API, NP-API-KEY), whose docs say only "This API will list all warehouses from your Nimbuspost account." ' +
        'and give no response fields or example, so its rows cannot be mapped',
    )
  }

  // ── Manifests ──────────────────────────────────────────────────────────────
  // POST /shipments/manifest — create manifest from AWB numbers
  // No list/get manifest endpoint exists in the NimbusPost API.
  // Docs: https://documenter.getpostman.com/view/9692837/TW6wHnoz#31f3e7ea-66ce-4244-a40b-d15b191f4969

  async createManifest(credentials: Credentials, data: Partial<Manifest>): Promise<Manifest> {
    const client = new NimbusPostClient(credentials)
    const raw = await client.post<NimbusPostManifestRaw>('shipments/manifest', {
      awbs: data.shipmentIds ?? [],
    })
    return transformManifest(raw)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new NimbusPostClient(credentials)
    const raw = await client.get<NimbusPostTrackingResponse>(`tracking/${trackingNumber}`)
    return transformTracking({ ...raw, tracking_number: raw.tracking_number ?? trackingNumber })
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new NimbusPostClient(credentials)
    const raw = await client.post<NimbusPostShipmentRaw>('shipments', {
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
  // POST /courier/serviceability — freight rates between origin/destination
  // Docs: https://documenter.getpostman.com/view/9692837/TW6wHnoz#4dc571fd-6edb-4e59-a1c4-7ed39e9cc2f0

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new NimbusPostClient(credentials)
    const pkg = params.packages[0]
    const res = await client.post<{ data?: NimbusPostRateRaw[] } | NimbusPostRateRaw[]>('courier/serviceability', {
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
    const list: NimbusPostRateRaw[] = Array.isArray((res as { data?: NimbusPostRateRaw[] }).data)
      ? (res as { data: NimbusPostRateRaw[] }).data
      : Array.isArray(res)
        ? (res as NimbusPostRateRaw[])
        : []
    return list.map(transformRate)
  }
}
