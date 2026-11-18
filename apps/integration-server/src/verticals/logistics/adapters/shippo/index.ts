import { reportUpstreamPage, simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
  RateRequestParams,
  PickupRequestParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Label } from '../../schema/label'
import type { Carrier } from '../../schema/carrier'
import type { Order } from '../../schema/order'
import type { Manifest } from '../../schema/manifest'
import type { Pickup } from '../../schema/pickup'
import type { WebhookEvent } from '../../schema/webhook'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { ShippoClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformShipment, type ShippoShipment } from './transform/shipment'
import { transformRate } from './transform/rate'
import { transformLabel, type ShippoTransaction } from './transform/label'
import { transformTracker, type ShippoTrack } from './transform/tracking'
import { transformCarrier, type ShippoCarrierAccount } from './transform/carrier'
import { transformOrder, type ShippoOrder } from './transform/order'
import { transformManifest, type ShippoManifest } from './transform/manifest'
import { transformPickup, type ShippoPickup } from './transform/pickup'

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: warehouse — Shippo API has no warehouse or fulfillment-center
//   concept; the full public API spec lists only addresses, parcels,
//   shipments, rates, transactions, carrier_accounts, manifests, orders,
//   tracks, customs, batches, pickups, and refunds — no warehouse endpoint.
// Pickup: createPickup only — `POST /pickups` is the sole pickup operation on
//   the public API (USPS and DHL Express accounts). No list, get or cancel
//   exists; the spec's own `cancel_by_time` text says to contact the carrier
//   directly with `confirmation_code`. Not yet declared in metadata.ts
//   (totalResources stays 8) — the metadata PR owns that.

interface ShippoAdapterConfig {
  clientId?: string
  clientSecret?: string
  redirectUri?: string
  scopes?: string[]
}

interface ShippoPaginatedResponse<T> {
  next: string | null
  previous: string | null
  results: T[]
}
const SIMPLE_API_KEY_FORM = simpleApiKey()

/**
 * Query for one caller page of a Shippo list. Every list endpoint used here
 * (GET /shipments, /orders, /transactions, /carrier_accounts, /manifests)
 * documents `page` ("The page number you want to select", default 1) and
 * `results` ("The number of results to return per page (max 100)"), and
 * answers a PaginatedList whose `next` links the next page
 * (`baseurl?page=3&results=10`). The spec gives `next` only as a string with
 * that example and never says what it is on the last page; a null, absent or
 * empty `next` is treated as the end (assumed, not quoted). Spec:
 * https://docs.goshippo.com/spec/shippoapi/public-api.yaml
 *
 * A direct call past MAX_PAGE_SIZE pages at MAX_PAGE_SIZE, and reports it.
 */
function pageQuery(params: QueryParams): { page: number; results: number } {
  return {
    page: params.page ?? 1,
    results: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
  }
}

/** Report one Shippo page: more rows exist while `next` is set. */
function reportPage(
  params: QueryParams,
  res: ShippoPaginatedResponse<unknown>,
  sent: { results: number },
): void {
  reportUpstreamPage(params, { hasMore: Boolean(res.next), pageSize: sent.results })
}

/**
 * A request this adapter can already see Shippo will refuse. Carries a 400 so
 * the message reaches the caller — a bare Error is answered as a 500 with its
 * message hidden.
 */
function badRequest(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 400, code: 'VALIDATION' })
}


export class ShippoAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'shippo'
  readonly version = '1'
  /** Shippo's documented `results` maximum, shared by every list endpoint used here. */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  constructor(_config: ShippoAdapterConfig = {}) {}

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

  // ── Webhook ────────────────────────────────────────────────────────────────

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    const event = String(payload['event'] ?? '')
    const data = payload['data'] as Record<string, unknown> | undefined
    const resourceId = data ? String(data['object_id'] ?? '') : undefined

    type CanonicalResource = WebhookEvent['resourceType']
    const resourceTypeMap: Record<string, CanonicalResource> = {
      transaction_created: 'label',
      transaction_updated: 'label',
      track_updated: 'tracking_event',
      batch_created: 'shipment',
      batch_purchased: 'shipment',
    }

    const resourceType = resourceTypeMap[event]
    if (!resourceType) return []

    type CanonicalAction = WebhookEvent['action']
    const actionMap: Record<string, CanonicalAction> = {
      transaction_created: 'created',
      transaction_updated: 'updated',
      track_updated: 'updated',
      batch_created: 'created',
      batch_purchased: 'updated',
    }

    return [
      {
        platform: 'shippo',
        type: event,
        resourceType,
        action: actionMap[event] ?? 'updated',
        resourceId: resourceId || undefined,
        payload,
      },
    ]
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new ShippoClient(credentials)
    const query = pageQuery(params)
    const res = await client.get<ShippoPaginatedResponse<ShippoShipment>>('shipments', query)
    reportPage(params, res, query)
    return (res.results ?? []).map(transformShipment)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new ShippoClient(credentials)
    const raw = await client.get<ShippoShipment>(`shipments/${id}`)
    return transformShipment(raw)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new ShippoClient(credentials)
    const raw = await client.post<ShippoShipment>('shipments', {
      address_from: data.originAddress
        ? {
            name: data.originAddress.name,
            company: data.originAddress.company,
            street1: data.originAddress.street1,
            street2: data.originAddress.street2,
            city: data.originAddress.city,
            state: data.originAddress.state,
            zip: data.originAddress.postalCode,
            country: data.originAddress.country,
            phone: data.originAddress.phone,
            email: data.originAddress.email,
          }
        : undefined,
      address_to: data.destinationAddress
        ? {
            name: data.destinationAddress.name,
            company: data.destinationAddress.company,
            street1: data.destinationAddress.street1,
            street2: data.destinationAddress.street2,
            city: data.destinationAddress.city,
            state: data.destinationAddress.state,
            zip: data.destinationAddress.postalCode,
            country: data.destinationAddress.country,
            phone: data.destinationAddress.phone,
            email: data.destinationAddress.email,
          }
        : undefined,
      parcels: data.totalWeight
        ? [
            {
              weight: String(data.totalWeight.value),
              mass_unit: data.totalWeight.unit,
              length: data.dimensions?.length ? String(data.dimensions.length) : undefined,
              width: data.dimensions?.width ? String(data.dimensions.width) : undefined,
              height: data.dimensions?.height ? String(data.dimensions.height) : undefined,
              distance_unit: data.dimensions?.unit ?? 'in',
            },
          ]
        : undefined,
      metadata: data.reference ?? '',
    })
    return transformShipment(raw)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new ShippoClient(credentials)
    // Shippo tracking endpoint uses carrier/tracking_number in path.
    // Without knowing the carrier, we register tracking via POST.
    const raw = await client.post<ShippoTrack>('tracks', {
      carrier: '',
      tracking_number: trackingNumber,
    })
    return transformTracker(raw)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new ShippoClient(credentials)
    const res = await client.post<ShippoShipment>('shipments', {
      address_from: {
        name: params.originAddress.name,
        street1: params.originAddress.street1,
        street2: params.originAddress.street2,
        city: params.originAddress.city,
        state: params.originAddress.state,
        zip: params.originAddress.postalCode,
        country: params.originAddress.country,
      },
      address_to: {
        name: params.destinationAddress.name,
        street1: params.destinationAddress.street1,
        street2: params.destinationAddress.street2,
        city: params.destinationAddress.city,
        state: params.destinationAddress.state,
        zip: params.destinationAddress.postalCode,
        country: params.destinationAddress.country,
      },
      parcels: params.packages.map((pkg) => ({
        weight: pkg.weight ? String(pkg.weight.value) : '1',
        mass_unit: pkg.weight?.unit ?? 'oz',
        length: pkg.dimensions?.length ? String(pkg.dimensions.length) : undefined,
        width: pkg.dimensions?.width ? String(pkg.dimensions.width) : undefined,
        height: pkg.dimensions?.height ? String(pkg.dimensions.height) : undefined,
        distance_unit: pkg.dimensions?.unit ?? 'in',
      })),
    })
    return (res.rates ?? []).map(transformRate)
  }

  // ── Labels (Transactions) ──────────────────────────────────────────────────

  async listLabels(credentials: Credentials, params: QueryParams): Promise<Label[]> {
    const client = new ShippoClient(credentials)
    const query = pageQuery(params)
    const res = await client.get<ShippoPaginatedResponse<ShippoTransaction>>('transactions', query)
    reportPage(params, res, query)
    return (res.results ?? []).map(transformLabel)
  }

  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    const client = new ShippoClient(credentials)
    const raw = await client.get<ShippoTransaction>(`transactions/${id}`)
    return transformLabel(raw)
  }

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    const client = new ShippoClient(credentials)
    const raw = await client.post<ShippoTransaction>('transactions', {
      rate: (data.metadata as Record<string, unknown> | undefined)?.rate_id ?? '',
      label_file_type: data.format ?? 'PDF',
      metadata: '',
    })
    return transformLabel(raw)
  }

  async voidLabel(credentials: Credentials, id: string): Promise<void> {
    const client = new ShippoClient(credentials)
    await client.post<unknown>('refunds', { transaction: id })
  }

  // ── Carriers ───────────────────────────────────────────────────────────────

  async listCarriers(credentials: Credentials, params: QueryParams): Promise<Carrier[]> {
    const client = new ShippoClient(credentials)
    const query = pageQuery(params)
    const res = await client.get<ShippoPaginatedResponse<ShippoCarrierAccount>>('carrier_accounts', query)
    reportPage(params, res, query)
    return (res.results ?? []).map(transformCarrier)
  }

  async getCarrier(credentials: Credentials, id: string): Promise<Carrier> {
    const client = new ShippoClient(credentials)
    const raw = await client.get<ShippoCarrierAccount>(`carrier_accounts/${id}`)
    return transformCarrier(raw)
  }

  // ── Orders ─────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new ShippoClient(credentials)
    const query = pageQuery(params)
    const res = await client.get<ShippoPaginatedResponse<ShippoOrder>>('orders', query)
    reportPage(params, res, query)
    return (res.results ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new ShippoClient(credentials)
    const raw = await client.get<ShippoOrder>(`orders/${id}`)
    return transformOrder(raw)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new ShippoClient(credentials)
    const body: Record<string, unknown> = {
      order_number: data.orderNumber,
      order_status: data.status ?? 'PAID',
      to_address: data.destinationAddress
        ? {
            name: data.destinationAddress.name,
            company: data.destinationAddress.company,
            street1: data.destinationAddress.street1,
            street2: data.destinationAddress.street2,
            city: data.destinationAddress.city,
            state: data.destinationAddress.state,
            zip: data.destinationAddress.postalCode,
            country: data.destinationAddress.country,
            phone: data.destinationAddress.phone,
            email: data.destinationAddress.email,
          }
        : undefined,
      from_address: data.originAddress
        ? {
            name: data.originAddress.name,
            company: data.originAddress.company,
            street1: data.originAddress.street1,
            street2: data.originAddress.street2,
            city: data.originAddress.city,
            state: data.originAddress.state,
            zip: data.originAddress.postalCode,
            country: data.originAddress.country,
            phone: data.originAddress.phone,
            email: data.originAddress.email,
          }
        : undefined,
      currency: data.currency,
      notes: data.notes,
      shipping_method: data.requestedServiceCode,
    }
    const raw = await client.post<ShippoOrder>('orders', body)
    return transformOrder(raw)
  }

  // ── Manifests ──────────────────────────────────────────────────────────────

  async listManifests(credentials: Credentials, params: QueryParams): Promise<Manifest[]> {
    const client = new ShippoClient(credentials)
    const query = pageQuery(params)
    const res = await client.get<ShippoPaginatedResponse<ShippoManifest>>('manifests', query)
    reportPage(params, res, query)
    return (res.results ?? []).map(transformManifest)
  }

  async getManifest(credentials: Credentials, id: string): Promise<Manifest> {
    const client = new ShippoClient(credentials)
    const raw = await client.get<ShippoManifest>(`manifests/${id}`)
    return transformManifest(raw)
  }

  async createManifest(credentials: Credentials, data: Partial<Manifest>): Promise<Manifest> {
    const client = new ShippoClient(credentials)
    const body: Record<string, unknown> = {
      carrier_account: data.carrierId,
      transactions: data.shipmentIds ?? [],
    }
    const raw = await client.post<ShippoManifest>('manifests', body)
    return transformManifest(raw)
  }

  // ── Pickups ────────────────────────────────────────────────────────────────

  async createPickup(credentials: Credentials, data: PickupRequestParams): Promise<Pickup> {
    // `POST /pickups` marks carrier_account, transactions, both requested_*
    // times and location.building_location_type required. Three of those are
    // optional canonical keys and the last only rides on the index signature,
    // so each is named here rather than surfacing as an opaque carrier 400.
    if (!data.carrierId) {
      throw badRequest(
        'shippo: carrierId is required to schedule a pickup — the object id of a USPS or DHL Express carrier_account',
      )
    }
    if (!data.shipmentIds || data.shipmentIds.length === 0) {
      throw badRequest(
        'shippo: shipmentIds is required to schedule a pickup — the transaction (label) object ids to collect',
      )
    }
    if (!data.address) throw badRequest('shippo: address is required to schedule a pickup')
    if (!data.readyAt) throw badRequest('shippo: readyAt is required to schedule a pickup')
    if (!data.closeAt) {
      throw badRequest(
        'shippo: closeAt is required to schedule a pickup — Shippo needs the full requested window',
      )
    }
    const buildingLocationType = data.buildingLocationType
    if (typeof buildingLocationType !== 'string' || buildingLocationType === '') {
      throw badRequest(
        'shippo: buildingLocationType is required to schedule a pickup — Shippo\'s location.building_location_type, one of "Front Door", "Back Door", "Side Door", "Knock on Door", "Ring Bell", "In/At Mailbox", "Mail Room", "Office", "Reception", "Security Deck", "Shipping Dock" or "Other"',
      )
    }
    if (buildingLocationType === 'Other' && !data.instructions) {
      throw badRequest('shippo: instructions is required when buildingLocationType is "Other"')
    }

    const client = new ShippoClient(credentials)
    const raw = await client.post<ShippoPickup>('pickups', {
      carrier_account: data.carrierId,
      location: {
        building_location_type: buildingLocationType,
        building_type: typeof data.buildingType === 'string' ? data.buildingType : undefined,
        instructions: data.instructions,
        address: {
          name: data.address.name,
          company: data.address.company,
          street1: data.address.street1,
          street2: data.address.street2,
          city: data.address.city,
          state: data.address.state,
          zip: data.address.postalCode,
          country: data.address.country,
          phone: data.address.phone,
          email: data.address.email,
        },
      },
      transactions: data.shipmentIds,
      requested_start_time: data.readyAt.toISOString(),
      requested_end_time: data.closeAt.toISOString(),
    })
    return transformPickup(raw)
  }
}
