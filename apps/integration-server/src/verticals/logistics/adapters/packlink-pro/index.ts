// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: order — Packlink PRO exposes only POST /v1/orders (create); no list/get order endpoints exist in the public API
// Unavailable: manifest — No manifest endpoint found in the Packlink PRO public API

import { pageLocally, simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  RateRequestParams,
  QueryParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Label } from '../../schema/label'
import type { Carrier } from '../../schema/carrier'
import type { Warehouse } from '../../schema/warehouse'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { PacklinkProClient } from './client'

import { transformTracking, type PacklinkProTrackingResponse } from './transform/tracking'
import { transformShipment, type PacklinkProShipment } from './transform/shipment'
import { transformRate, type PacklinkProRate } from './transform/rate'
import { transformLabel, type PacklinkProLabel } from './transform/label'
import { transformWarehouse, type PacklinkProWarehouse } from './transform/warehouse'

interface PacklinkProAdapterConfig {
  sandbox?: boolean
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class PacklinkProAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'packlink-pro'
  readonly version = '1'

  constructor(_config: PacklinkProAdapterConfig = {}) {}

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

  // Packlink tracks by its own shipment reference, not a carrier tracking
  // number: Proxy::getTrackingInfo($referenceId) calls
  // "shipments/{$reference}/track" (packlink-dev/ecommerce_module_core,
  // src/BusinessLogic/Http/Proxy.php). The argument is that reference.
  async getTrackingEvents(credentials: Credentials, reference: string): Promise<TrackingEvent[]> {
    const client = new PacklinkProClient(credentials)
    const raw = await client.get<PacklinkProTrackingResponse>(
      `shipments/${encodeURIComponent(reference)}/track`,
    )
    return transformTracking(raw ?? {}, reference)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new PacklinkProClient(credentials)
    const raw = await client.post<PacklinkProShipment>('shipments', {
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
    const client = new PacklinkProClient(credentials)
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
    const res = await client.post<{ rates: PacklinkProRate[] }>('rates', body)
    return (res.rates ?? []).map(transformRate)
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    const client = new PacklinkProClient(credentials)
    const res = await client.post<PacklinkProLabel>('labels', {
      shipment_id: data.shipmentId ?? data.id,
      format: data.format ?? 'PDF',
    })
    return transformLabel(res)
  }

  // ── Carriers ───────────────────────────────────────────────────────────────

  // Packlink documents no carrier collection. The only services call in its
  // own integration core is a quote search that refuses to run without a lane:
  //   if (!$params->isValid()) { ... throw new HttpRequestException('Missing required search parameter(s).', 400); }
  //   $response = $this->call(HttpClient::HTTP_METHOD_GET, 'services?' . http_build_query($params->toArray()));
  // (packlink-dev/ecommerce_module_core, src/BusinessLogic/Http/Proxy.php), where
  // ShippingServiceSearch::isValid() requires fromCountry, fromZip, toCountry,
  // toZip and packages. A lane search is not a list, so this refuses.
  async listCarriers(_credentials: Credentials, _params: QueryParams): Promise<Carrier[]> {
    throw Object.assign(
      new Error(
        "Packlink PRO cannot list carriers: its only services endpoint is a quote search, GET v1/services, which Packlink's own client refuses to call without 'Missing required search parameter(s).' (from/to country and zip, packages)",
      ),
      { statusCode: 501, code: 'NOT_SUPPORTED' },
    )
  }

  // ── Warehouses ─────────────────────────────────────────────────────────────

  // GET clients/warehouses is not paged: Packlink's own integration core
  // (packlink-dev/ecommerce_module_core, Http/Proxy.php getUsersWarehouses)
  // sends no query parameters and treats the body as the whole batch. One
  // response is the whole collection, so the caller's page is cut locally.
  async listWarehouses(credentials: Credentials, params: QueryParams): Promise<Warehouse[]> {
    return pageLocally(await this.fetchWarehouses(credentials), params)
  }

  // No get-by-id path is documented; the documented collection is the whole
  // set, so a warehouse is read back from it.
  async getWarehouse(credentials: Credentials, id: string): Promise<Warehouse> {
    const found = (await this.fetchWarehouses(credentials)).find((w) => w.id === id)
    if (!found) {
      throw Object.assign(new Error(`Packlink PRO warehouse ${id} not found`), {
        statusCode: 404,
        code: 'NOT_FOUND',
      })
    }
    return found
  }

  private async fetchWarehouses(credentials: Credentials): Promise<Warehouse[]> {
    const client = new PacklinkProClient(credentials)
    const raw = await client.get<PacklinkProWarehouse[]>('clients/warehouses')
    return (Array.isArray(raw) ? raw : []).map(transformWarehouse)
  }
}
