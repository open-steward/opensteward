// ── Resource coverage ──────────────────────────────────────────────────────────
// Reads follow the first-party specs at https://dev.metapack.com/ (Shipping API
// 1.14.0 at https://api.metapack.com/shipping/v1, Tracking API 1.0.13 at
// https://api.metapack.com/tracking/v1), both HTTP Basic auth:
//   listCarriers   GET /carriers           — whole list, no paging params
//   getCarrier     GET /carriers + GET /carriers/{carrierCode}/services
//   listWarehouses GET /shippingLocations  — whole list, no paging params
//   getTrackingEvents GET /parcel-journeys?trackingIdentifier=…
// The write methods below predate the rebuild and still send the adapter's
// own request shapes (see the rebuild record); they are not verified.
// Unavailable: order — Metapack has no /orders endpoint; the platform is
//              consignment/carrier-centric and does not expose an Order resource.
// Unavailable: manifest (list/get) — POST /manifests returns only HATEOAS links;
//              there is no GET /manifests list or GET /manifests/{id} data endpoint.
//              createManifest is implemented; listManifests and getManifest are not.

import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
  RateRequestParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Label } from '../../schema/label'
import type { Carrier } from '../../schema/carrier'
import type { Warehouse } from '../../schema/warehouse'
import type { Manifest } from '../../schema/manifest'

import { customForm, pageLocally } from '@opensteward/shared'
import {
  buildAuthUrl,
  exchangeApiKey,
  exchangeBasicCredentials,
  refreshCredentials as doRefresh,
} from './auth'
import { MetapackClient } from './client'

import { transformParcelJourneys, type MetapackParcelJourney } from './transform/tracking'
import { transformShipment, type MetapackShipment } from './transform/shipment'
import { transformRate, type MetapackRate } from './transform/rate'
import { transformLabel, type MetapackLabel } from './transform/label'
import {
  transformCarrier,
  type MetapackCarrier,
  type MetapackCarrierService,
} from './transform/carrier'
import { transformWarehouse, type MetapackWarehouse } from './transform/warehouse'
import { transformManifest, type MetapackManifestResponse } from './transform/manifest'

export interface MetapackAdapterConfig {
  /** Send every request to the documented sandbox hosts (api.sbx.metapack.com). */
  sandbox?: boolean
}

// ── Connect Link credential form ──────────────────────────────────────────────

const CREDENTIAL_FORM = customForm({
  fields: [
    {
      name: 'username',
      label: 'API username',
      type: 'text',
      required: true,
      helpText:
        'The username in the API key email from your Metapack Professional Services consultant.',
    },
    {
      name: 'password',
      label: 'API password',
      type: 'password',
      required: true,
      helpText: 'The password from the same API key email.',
    },
  ],
  exchange: (fields: Record<string, string>): Promise<Credentials> =>
    exchangeBasicCredentials((fields['username'] ?? '').trim(), fields['password'] ?? ''),
})

/** GET /carriers: a bare array of every carrier on the shipper account. */
async function fetchCarriers(client: MetapackClient): Promise<MetapackCarrier[]> {
  const rows = await client.get<MetapackCarrier[] | undefined>('carriers')
  return Array.isArray(rows) ? rows : []
}

function notFound(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 404, code: 'NOT_FOUND' })
}

export class MetapackAdapter implements LogisticsAdapter {
  readonly platform = 'metapack'
  readonly version = '1'

  constructor(config: MetapackAdapterConfig = {}) {
    this.config = config
  }

  private config: MetapackAdapterConfig

  private client(
    credentials: Credentials,
    api: 'shipping' | 'tracking' = 'shipping',
  ): MetapackClient {
    return new MetapackClient(credentials, api, this.config.sandbox === true)
  }

  // ── Auth (HTTP Basic: username + password) ─────────────────────────────────

  credentialFields = CREDENTIAL_FORM.credentialFields
  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  /** Accepts "username:password". */
  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return exchangeApiKey(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  /**
   * Tracking API GET /parcel-journeys, `trackingIdentifier`: "Use the tracking
   * identifier to retrieve the parcel journey for a specific parcel."
   */
  async getTrackingEvents(
    credentials: Credentials,
    trackingNumber: string,
  ): Promise<TrackingEvent[]> {
    const journeys = await this.client(credentials, 'tracking').get<
      MetapackParcelJourney[] | undefined
    >('parcel-journeys', { trackingIdentifier: trackingNumber })
    return transformParcelJourneys(Array.isArray(journeys) ? journeys : [])
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = this.client(credentials)
    const raw = await client.post<MetapackShipment>('shipments', {
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
      reference: data.reference,
      service_code: data.serviceCode,
    })
    return transformShipment(raw)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = this.client(credentials)
    const firstPkg = params.packages[0]
    const body = {
      from: {
        postal_code: params.originAddress.postalCode,
        country: params.originAddress.country,
      },
      to: {
        postal_code: params.destinationAddress.postalCode,
        country: params.destinationAddress.country,
      },
      weight: firstPkg?.weight?.value,
      weight_unit: firstPkg?.weight?.unit,
      length: firstPkg?.dimensions?.length,
      width: firstPkg?.dimensions?.width,
      height: firstPkg?.dimensions?.height,
      service_codes: params.serviceCodes,
    }
    const res = await client.post<{ rates: MetapackRate[] }>('rates', body)
    return (res.rates ?? []).map(transformRate)
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    const client = this.client(credentials)
    const res = await client.post<MetapackLabel>('labels', {
      shipment_id: data.shipmentId ?? data.id,
      format: data.format ?? 'PDF',
    })
    return transformLabel(res)
  }

  // ── Carriers ───────────────────────────────────────────────────────────────

  /**
   * GET /carriers takes no parameters and returns every carrier on the shipper
   * account as one array, so the caller's page is cut from the whole list.
   */
  async listCarriers(credentials: Credentials, params: QueryParams): Promise<Carrier[]> {
    const rows = await fetchCarriers(this.client(credentials))
    return pageLocally(
      rows.map((r) => transformCarrier(r)),
      params,
    )
  }

  /**
   * There is no GET /carriers/{code}: the carrier is found in GET /carriers and
   * its services read from GET /carriers/{carrierCode}/services.
   */
  async getCarrier(credentials: Credentials, id: string): Promise<Carrier> {
    const client = this.client(credentials)
    const rows = await fetchCarriers(client)
    const raw = rows.find((r) => r.code === id)
    if (!raw)
      throw notFound(`Metapack carrier '${id}' is not associated with this shipper account.`)
    const services = await client.get<MetapackCarrierService[] | undefined>(
      `carriers/${encodeURIComponent(id)}/services`,
    )
    return transformCarrier(raw, Array.isArray(services) ? services : [])
  }

  // ── Warehouses ─────────────────────────────────────────────────────────────

  /**
   * GET /shippingLocations takes no parameters and returns every warehouse on
   * the shipper account as one array, so the caller's page is cut from it.
   */
  async listWarehouses(credentials: Credentials, params: QueryParams): Promise<Warehouse[]> {
    const rows = await this.client(credentials).get<MetapackWarehouse[] | undefined>(
      'shippingLocations',
    )
    return pageLocally((Array.isArray(rows) ? rows : []).map(transformWarehouse), params)
  }

  // ── Manifests ──────────────────────────────────────────────────────────────

  async createManifest(credentials: Credentials, data: Partial<Manifest>): Promise<Manifest> {
    const client = this.client(credentials)
    const body = {
      carrierCode: data.carrierId,
      shippingLocationCode: data.warehouseId,
    }
    const res = await client.post<MetapackManifestResponse>('manifests', body)
    return transformManifest(res)
  }
}
