import { simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
  RateRequestParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { FreightifyClient } from './client'

import { transformShipment, type FreightifyShipment } from './transform/shipment'
import { transformRate, type FreightifyRate } from './transform/rate'

// ── Resource coverage ──────────────────────────────────────────────
// Available:   rate, shipment, trackingevent (declared in metadata.ts). Every shipment and
//              tracking read refuses with 501: the public specs document no collection
//              and no id-only lookup (see the method comments).
// Known gap:   the client host (api.freightify.io) and "api-key" header differ from the
//              documented https://api.freightify.com with "x-api-key" or OAuth2; not changed
//              here. getRates and createShipment still call undocumented paths.
// Unverified:  carrier — no carrier collection in the public specs
//              (cdn.freightbro.in/docs/track/ and /docs/schedules/freightify-api.yaml, whose
//              only paths are /v1/track/container, /v1/track/bl and /v1/schedules)
// Unavailable: label    — ocean freight rate platform; does not generate parcel shipping labels
// Unavailable: manifest — no manifest concept; scope is rate procurement and container tracking only
// Unavailable: order    — no order management; freight bookings are already mapped as shipments
// Unavailable: warehouse — no warehouse management functionality

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface FreightifyAdapterConfig {}

const SIMPLE_API_KEY_FORM = simpleApiKey()

/** The only two paths in https://cdn.freightbro.in/docs/track/freightify-api.yaml. */
const TRACK_PATHS = 'GET /v1/track/container/{containerId} and GET /v1/track/bl/{blNumber}'

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

export class FreightifyAdapter implements LogisticsAdapter {
  // Connect Link support — single API-key form
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'freightify'
  readonly version = '1'

  constructor(_config: FreightifyAdapterConfig = {}) {}

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // For Freightify the "code" is the API key itself.
    return exchangeApiKey(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────
  //
  // The first-party Track & Trace spec
  // (https://cdn.freightbro.in/docs/track/freightify-api.yaml) has exactly two
  // paths, "/v1/track/container/{containerId}" ("Track a shipment by its
  // container number.") and "/v1/track/bl/{blNumber}" ("Track a shipment by its
  // BL number."), and the Schedules spec has only "/v1/schedules". Neither
  // documents a shipment collection or a shipment read by id.

  async listShipments(_credentials: Credentials, _params: QueryParams): Promise<Shipment[]> {
    throw notSupported(
      `Freightify cannot list shipments: its public API documents only ${TRACK_PATHS}, with no shipment collection`,
    )
  }

  async getShipment(_credentials: Credentials, _id: string): Promise<Shipment> {
    throw notSupported(
      `Freightify cannot read shipments by id: its public API documents only ${TRACK_PATHS}, with no shipment resource`,
    )
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new FreightifyClient(credentials)
    const raw = await client.post<FreightifyShipment>('shipments', {
      booking_number: data.reference,
      container_type: data.ocean?.containerType,
      port_of_loading: data.ocean?.portOfLoading,
      port_of_discharge: data.ocean?.portOfDischarge,
      carrier_scac: data.carrierId,
      service_code: data.serviceCode,
      origin_address: data.originAddress
        ? {
            city: data.originAddress.city,
            country: data.originAddress.country,
          }
        : undefined,
      destination_address: data.destinationAddress
        ? {
            city: data.destinationAddress.city,
            country: data.destinationAddress.country,
          }
        : undefined,
      notes: data.notes,
    })
    return transformShipment(raw)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────
  //
  // The documented lookups need the carrier SCAC ("name": "sealine", "in":
  // "query", "required": true, "description": "carrier scac"), which this
  // method signature does not carry, and they live on the documented host
  // (https://api.freightify.com, "x-api-key" or OAuth2) that this client does
  // not use yet. The old `tracking/{n}` path was not in the spec.

  async getTrackingEvents(
    _credentials: Credentials,
    _trackingNumber: string,
  ): Promise<TrackingEvent[]> {
    throw notSupported(
      `Freightify cannot read tracking events by tracking number alone: its documented lookups ${TRACK_PATHS} require the "sealine" (carrier scac) query parameter`,
    )
  }

  async listTrackingEvents(
    _credentials: Credentials,
    _params: QueryParams,
  ): Promise<TrackingEvent[]> {
    throw notSupported(
      `Freightify cannot list tracking events: its public API documents only per-container and per-BL lookups (${TRACK_PATHS}), with no event collection`,
    )
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new FreightifyClient(credentials)
    // Freightify rate search uses origin/destination port codes and container type
    const res = await client.post<{ data: FreightifyRate[]; rates?: FreightifyRate[] }>(
      'rates/search',
      {
        origin_port: params.originAddress.postalCode ?? params.originAddress.city,
        destination_port: params.destinationAddress.postalCode ?? params.destinationAddress.city,
        origin_country: params.originAddress.country,
        destination_country: params.destinationAddress.country,
        container_type: params.serviceCodes?.[0],
        cargo_ready_date: new Date().toISOString().slice(0, 10),
      },
    )
    const items = res.data ?? res.rates ?? []
    return items.map(transformRate)
  }
}
