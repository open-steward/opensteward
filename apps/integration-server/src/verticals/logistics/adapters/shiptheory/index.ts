import { pageLocally, reportUpstreamPage, simpleApiKey } from '@opensteward/shared'
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

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { buildClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformShipment, type ShiptheoryShipment } from './transform/shipment'
import { transformShipmentToTrackingEvents } from './transform/tracking'
import { transformShipmentToLabel } from './transform/label'
import { transformService, type ShiptheoryService } from './transform/rate'
import { transformCarrierFromServices } from './transform/carrier'

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: manifest  — Shiptheory API has no manifest endpoints; the API covers shipment booking, returns, services, and packages only.
// Unavailable: order     — Shiptheory API has no order management endpoints; orders are managed externally and pushed as shipments.
// Unavailable: warehouse — Shiptheory API has no warehouse endpoints; warehouse configuration is done through the dashboard UI only.

interface ShiptheoryAdapterConfig {
  partnerTag?: string
}

interface ShiptheoryListResponse {
  shipments?: ShiptheoryShipment[]
  pagination?: {
    page?: number
    pages?: number
    results?: number
  }
}

/**
 * One page of GET /shipments/list, which pages by `page` + `limit`
 * (https://shiptheory.com/developer/index.html, "Pagination"):
 *   "page Page number to return. 404 means you have specified a page number
 *    without results"
 *   "pages Total number of pages with results"
 * and, on the method itself, "This method supports paging. ... The maximum
 * limit of results per page for this call is 100."
 *
 * Before this, both list methods always sent `page: 1`, so caller page 2
 * repeated page 1 and nothing past the first page was reachable.
 */
async function fetchShipmentPage(
  credentials: Credentials,
  params: QueryParams,
): Promise<ShiptheoryShipment[]> {
  const client = await buildClient(credentials)
  const size = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
  const page = params.page ?? 1
  const clamped = params.limit !== undefined && size < params.limit ? { pageSize: size } : {}
  let res: ShiptheoryListResponse
  try {
    res = await client.get<ShiptheoryListResponse>('/shipments/list', { limit: size, page })
  } catch (err) {
    // A page past the last one is a documented 404, not an error.
    if ((err as { response?: { status?: number } })?.response?.status === 404 && page > 1) {
      reportUpstreamPage(params, { hasMore: false, ...clamped })
      return []
    }
    throw err
  }
  const pages = res.pagination?.pages
  const results = res.pagination?.results
  reportUpstreamPage(params, {
    ...(typeof pages === 'number' ? { hasMore: page < pages, totalPages: pages } : {}),
    ...(typeof results === 'number' ? { totalCount: results } : {}),
    ...clamped,
  })
  return res.shipments ?? []
}

interface ShiptheoryServicesResponse {
  [carrier: string]: ShiptheoryService[] | unknown
}

const SIMPLE_API_KEY_FORM = simpleApiKey({
  label: 'Email:Password',
  placeholder: 'you@example.com:yourpassword',
  helpText: 'Enter your Shiptheory login email and password separated by a colon.',
})

export class ShiptheoryAdapter implements LogisticsAdapter {
  // Connect Link support — simple credential field collecting email:password
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'shiptheory'
  readonly version = '1'
  /** "The maximum limit of results per page for this call is 100." (GET /shipments/list) */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  constructor(_config: ShiptheoryAdapterConfig = {}) {}

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
    return (await fetchShipmentPage(credentials, params)).map(transformShipment)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = await buildClient(credentials)
    const raw = await client.get<ShiptheoryShipment>(`/shipments/${id}`)
    return transformShipment(raw)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = await buildClient(credentials)

    const dest = data.destinationAddress
    const origin = data.originAddress

    const body = {
      reference: data.reference ?? '',
      reference2: data.reference ?? '',
      weight: data.totalWeight?.value ?? 0,
      parcels: 1,
      value: data.cost?.amount ?? 0,
      recipient: dest
        ? {
            firstname: dest.name?.split(' ')[0] ?? '',
            lastname: dest.name?.split(' ').slice(1).join(' ') ?? '',
            company: dest.company ?? '',
            address_line_1: dest.street1 ?? '',
            address_line_2: dest.street2 ?? '',
            city: dest.city ?? '',
            county: dest.state ?? '',
            postcode: dest.postalCode ?? '',
            country: dest.country ?? '',
            telephone: dest.phone ?? '',
            email: dest.email ?? '',
          }
        : undefined,
      sender: origin
        ? {
            firstname: origin.name?.split(' ')[0] ?? '',
            lastname: origin.name?.split(' ').slice(1).join(' ') ?? '',
            company: origin.company ?? '',
            address_line_1: origin.street1 ?? '',
            address_line_2: origin.street2 ?? '',
            city: origin.city ?? '',
            county: origin.state ?? '',
            postcode: origin.postalCode ?? '',
            country: origin.country ?? '',
            telephone: origin.phone ?? '',
            email: origin.email ?? '',
          }
        : undefined,
    }

    const raw = await client.post<ShiptheoryShipment>('/shipments', body)
    return transformShipment(raw)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(
    credentials: Credentials,
    trackingNumber: string,
  ): Promise<TrackingEvent[]> {
    // Shiptheory identifies shipments by channel_reference_id, not tracking number.
    // We search shipments by the tracking number reference.
    const client = await buildClient(credentials)
    const today = new Date()
    const yearAgo = new Date(today)
    yearAgo.setFullYear(today.getFullYear() - 1)
    const fmt = (d: Date) => d.toISOString().slice(0, 10)

    const res = await client.get<ShiptheoryListResponse>('/shipments/search', {
      tracking_number: trackingNumber,
      created_from: fmt(yearAgo),
      created_to: fmt(today),
      limit: 1,
    })
    const shipments = res.shipments ?? []
    if (shipments.length === 0) return []
    return transformShipmentToTrackingEvents(shipments[0])
  }

  async listTrackingEvents(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<TrackingEvent[]> {
    // GET /shipments/search documents no page parameter ("limit ... Allowed
    // range is 1-100 shipments"), so it can never reach shipment 101. The same
    // shipments come from the paged GET /shipments/list instead. Each shipment
    // yields exactly one synthesised event, so a page of shipments is a page
    // of events and the upstream paging carries straight through.
    return (await fetchShipmentPage(credentials, params)).flatMap(transformShipmentToTrackingEvents)
  }

  // ── Carriers ───────────────────────────────────────────────────────────────

  async listCarriers(credentials: Credentials, params: QueryParams): Promise<Carrier[]> {
    // GET /services is not paged ("Performing a GET on /services returns a list
    // of outgoing delivery services available on your Shiptheory account"), so
    // every carrier is in hand: serve the caller's page of it.
    return pageLocally(await this.allCarriers(credentials), params)
  }

  private async allCarriers(credentials: Credentials): Promise<Carrier[]> {
    const client = await buildClient(credentials)
    const res = await client.get<Record<string, ShiptheoryService[] | unknown>>('/services')

    const carriers: Carrier[] = []
    for (const [slug, carrierServices] of Object.entries(res)) {
      if (Array.isArray(carrierServices)) {
        const services = carrierServices.filter(
          (svc): svc is ShiptheoryService => svc != null && typeof svc === 'object',
        )
        carriers.push(transformCarrierFromServices(slug, services))
      }
    }
    return carriers
  }

  async getCarrier(credentials: Credentials, id: string): Promise<Carrier> {
    const carriers = await this.allCarriers(credentials)
    const found = carriers.find((c) => c.id === id)
    if (!found) throw new Error(`Shiptheory carrier ${id} not found`)
    return found
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, _params: RateRequestParams): Promise<Rate[]> {
    // Shiptheory does not provide a rate-shopping endpoint.
    // We return the list of available outgoing services as Rate stubs.
    const client = await buildClient(credentials)
    const res = await client.get<ShiptheoryServicesResponse>('/services')

    const services: ShiptheoryService[] = []
    for (const carrierServices of Object.values(res)) {
      if (Array.isArray(carrierServices)) {
        for (const svc of carrierServices) {
          if (svc && typeof svc === 'object') {
            services.push(svc as ShiptheoryService)
          }
        }
      }
    }
    return services.map(transformService)
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    const client = await buildClient(credentials)
    const raw = await client.get<ShiptheoryShipment>(`/shipments/${id}`)
    return transformShipmentToLabel(raw)
  }

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    if (!data.shipmentId) throw new Error('shipmentId is required to create a Shiptheory label')
    // Creating a label in Shiptheory means booking a shipment; re-fetch after booking.
    const client = await buildClient(credentials)
    const raw = await client.get<ShiptheoryShipment>(`/shipments/${data.shipmentId}`)
    return transformShipmentToLabel(raw)
  }
}
