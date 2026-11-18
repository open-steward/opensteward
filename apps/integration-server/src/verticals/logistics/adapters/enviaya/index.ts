import { pageLocally, simpleApiKey } from '@opensteward/shared'
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
import type { WebhookEvent } from '../../schema/webhook'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { EnviaYaClient } from './client'
import { ENVIAYA_SERVICES_MAP_URL } from './constants'

import { transformShipment, type EnviaYaShipment } from './transform/shipment'
import { transformRate, type EnviaYaRateResult } from './transform/rate'
import { transformLabel, type EnviaYaLabel } from './transform/label'
import { transformTracking, type EnviaYaTracking } from './transform/tracking'
import { transformServicesMap, type EnviaYaServicesMapResponse } from './transform/carrier'

// ── Resource coverage ──────────────────────────────────────────────────────────
// Unavailable: manifest  — EnviaYa has no manifest endpoint; it is a carrier-aggregator, not a WMS
// Unavailable: order     — EnviaYa has no orders API; shipments are booked directly
// Unavailable: warehouse — EnviaYa has no warehouse endpoint; it is a carrier-aggregator

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface EnviaYaAdapterConfig {
  // No OAuth config required — API key only
}

const SIMPLE_API_KEY_FORM = simpleApiKey()

export class EnviaYaAdapter implements LogisticsAdapter {
  // Connect Link support — single API-key form.
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'enviaya'
  readonly version = '1'

  constructor(_config: EnviaYaAdapterConfig = {}) {}

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    return buildAuthUrl(_state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // For EnviaYa the "code" is the API key itself.
    return exchangeApiKey(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    // EnviaYa webhook payloads include the event type in the triggered event
    // name (e.g. "shipments.status_update").  The payload contains the
    // selected shipment fields configured when the webhook was created.
    const eventType = String(payload['event'] ?? payload['event_type'] ?? '')
    const shipmentId =
      String(payload['enviaya_shipment_number'] ?? payload['shipment_id'] ?? '') || undefined

    // Map EnviaYa event names to canonical resource type and action.
    type CanonicalResource = WebhookEvent['resourceType']
    type CanonicalAction = WebhookEvent['action']

    const eventMap: Record<string, { resourceType: CanonicalResource; action: CanonicalAction }> = {
      'shipments.status_update': { resourceType: 'shipment', action: 'updated' },
      'shipments.label_update': { resourceType: 'label', action: 'updated' },
      'shipments.carrier_tracking_number_update': {
        resourceType: 'tracking_event',
        action: 'updated',
      },
      'shipments.amounts_update': { resourceType: 'shipment', action: 'updated' },
      'shipments.origin_update': { resourceType: 'shipment', action: 'updated' },
      'shipments.destination_update': { resourceType: 'shipment', action: 'updated' },
      'shipments.estimated_delivery_date_update': {
        resourceType: 'shipment',
        action: 'updated',
      },
    }

    const mapped = eventMap[eventType]
    if (!mapped) return []

    return [
      {
        platform: 'enviaya',
        type: eventType,
        resourceType: mapped.resourceType,
        action: mapped.action,
        resourceId: shipmentId,
        payload,
      },
    ]
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  /**
   * EnviaYa documents no REST shipment list. The Shipment folder of its
   * Postman collection (https://docs.enviaya.com.mx/) holds only "Label (MX)"
   * POST https://enviaya.com.mx/api/v1/shipments?enviaya_account= and
   * "Label (MX) (With Account)" POST https://enviaya.com.mx/api/v1/shipments,
   * i.e. label booking; GET /api/v1/shipments answers 404. The one shipment
   * listing in the collection is the GraphQL "Shipments" request,
   * POST {{base_url}}/graphql, in a folder described as "mainly to be used by
   * the frontend requests", authorised by a Bearer "<token>", with {{base_url}}
   * defined in no published environment and no saved response to parse.
   */
  async listShipments(_credentials: Credentials, _params: QueryParams): Promise<Shipment[]> {
    throw Object.assign(
      new Error(
        'EnviaYa cannot list shipments: its REST API documents /api/v1/shipments only as POST ' +
          '(label booking), and the only shipment listing is a GraphQL query the docs describe as ' +
          '"mainly to be used by the frontend requests", with an undefined {{base_url}}, a frontend ' +
          'Bearer token and no documented response.',
      ),
      { statusCode: 501, code: 'NOT_SUPPORTED' },
    )
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new EnviaYaClient(credentials)
    const raw = await client.get<EnviaYaShipment>(`shipments/${id}`)
    return transformShipment(raw)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new EnviaYaClient(credentials)
    const raw = await client.post<EnviaYaShipment>('shipments', {
      carrier: data.carrierId ?? undefined,
      carrier_service_code: data.serviceCode ?? undefined,
      origin_direction: data.originAddress
        ? {
            full_name: data.originAddress.name,
            company: data.originAddress.company,
            direction_1: data.originAddress.street1,
            direction_2: data.originAddress.street2,
            city: data.originAddress.city,
            state_code: data.originAddress.state,
            postal_code: data.originAddress.postalCode,
            country_code: data.originAddress.country,
            phone: data.originAddress.phone,
            email: data.originAddress.email,
          }
        : undefined,
      destination_direction: data.destinationAddress
        ? {
            full_name: data.destinationAddress.name,
            company: data.destinationAddress.company,
            direction_1: data.destinationAddress.street1,
            direction_2: data.destinationAddress.street2,
            city: data.destinationAddress.city,
            state_code: data.destinationAddress.state,
            postal_code: data.destinationAddress.postalCode,
            country_code: data.destinationAddress.country,
            phone: data.destinationAddress.phone,
            email: data.destinationAddress.email,
          }
        : undefined,
      shipment: {
        shipment_type: 'Package',
        parcels: data.totalWeight
          ? [
              {
                quantity: 1,
                weight: data.totalWeight.value,
                weight_unit: data.totalWeight.unit,
                length: data.dimensions?.length,
                height: data.dimensions?.height,
                width: data.dimensions?.width,
                dimension_unit: data.dimensions?.unit ?? 'cm',
              },
            ]
          : undefined,
      },
      reference: data.reference,
    })
    return transformShipment(raw)
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new EnviaYaClient(credentials)
    await client.post<unknown>('request_cancellation', {
      enviaya_shipment_number: id,
    })
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new EnviaYaClient(credentials)
    // EnviaYa: POST /trackings with carrier and shipment_number
    const raw = await client.post<EnviaYaTracking>('trackings', {
      shipment_number: trackingNumber,
    })
    return transformTracking(raw)
  }

  async listTrackingEvents(credentials: Credentials, params: QueryParams): Promise<TrackingEvent[]> {
    const filter = params['filter'] as Record<string, unknown> | undefined
    const trackingNumber = filter?.['trackingNumber']
    if (!trackingNumber) return []
    return this.getTrackingEvents(credentials, String(trackingNumber))
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new EnviaYaClient(credentials)
    const pkg = params.packages[0]
    const res = await client.post<{ rates?: EnviaYaRateResult[] } | EnviaYaRateResult[]>('rates', {
      origin_direction: {
        country_code: params.originAddress.country,
        postal_code: params.originAddress.postalCode,
      },
      destination_direction: {
        country_code: params.destinationAddress.country,
        postal_code: params.destinationAddress.postalCode,
      },
      shipment: {
        shipment_type: 'Package',
        parcels: pkg
          ? [
              {
                quantity: 1,
                weight: pkg.weight?.value ?? 1,
                weight_unit: pkg.weight?.unit ?? 'kg',
                length: pkg.dimensions?.length ?? 10,
                height: pkg.dimensions?.height ?? 10,
                width: pkg.dimensions?.width ?? 10,
                dimension_unit: pkg.dimensions?.unit ?? 'cm',
              },
            ]
          : [{ quantity: 1, weight: 1, weight_unit: 'kg' }],
      },
      intelligent_filtering: true,
    })

    const list: EnviaYaRateResult[] = Array.isArray(res)
      ? res
      : ((res as { rates?: EnviaYaRateResult[] }).rates ?? [])
    return list.map(transformRate)
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    // Label lives on the shipment in EnviaYa
    const client = new EnviaYaClient(credentials)
    const raw = await client.get<EnviaYaLabel>(`shipments/${id}`)
    return transformLabel(raw)
  }

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    if (!data.shipmentId) throw new Error('shipmentId is required to create a label')
    const client = new EnviaYaClient(credentials)
    // Creating a label = booking a shipment with quick_booking
    const raw = await client.post<EnviaYaLabel>('shipments', {
      enviaya_shipment_number: data.shipmentId,
      file_format: data.format ?? 'PDF',
      quick_booking: true,
    })
    return transformLabel(raw)
  }

  async voidLabel(credentials: Credentials, id: string): Promise<void> {
    const client = new EnviaYaClient(credentials)
    await client.post<unknown>('request_cancellation', {
      enviaya_shipment_number: id,
    })
  }

  // ── Carriers ───────────────────────────────────────────────────────────────

  /**
   * The documented carrier catalogue: "Get all services". The collection's
   * request URL is http://localhost:3001/api/v2/carrier_services/services_map;
   * the production URL is the one in its saved example's originalRequest,
   * GET https://enviaya.com.mx/api/v2/carrier_services/services_map?api_key=API_KEY.
   * It takes no paging parameter and answers every carrier under `services`,
   * so the caller's page is cut locally.
   */
  async listCarriers(credentials: Credentials, params: QueryParams): Promise<Carrier[]> {
    const client = new EnviaYaClient(credentials)
    const res = await client.get<EnviaYaServicesMapResponse>(ENVIAYA_SERVICES_MAP_URL)
    return pageLocally(transformServicesMap(res), params)
  }
}
