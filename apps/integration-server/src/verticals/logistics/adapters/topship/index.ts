import { reportUpstreamPage, simpleApiKey } from '@opensteward/shared'
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

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { TopshipClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformShipment, type TopshipShipment } from './transform/shipment'
import { transformTracking, type TopshipTracking } from './transform/tracking'
import { transformRate, type TopshipRate } from './transform/rate'
import { transformLabel } from './transform/label'

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: carrier   — no carrier listing endpoint; rates surface as pricing tiers (Budget/Express/Premium), not carrier objects. /api/get-carriers → 404.
// Unavailable: manifest  — no manifest concept in the Topship API. /api/get-manifests → 404.
// Unavailable: order     — shipment-centric platform; no order management endpoint. /api/get-orders → 404.
// Unavailable: warehouse — no warehouse management API; drop-off/pickup points are not exposed as a resource. /api/get-warehouses → 404.

type TopshipAdapterConfig = Record<string, never>

const SIMPLE_API_KEY_FORM = simpleApiKey()

export class TopshipAdapter implements LogisticsAdapter {
  // Connect Link support — single API-key form.
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'topship'
  readonly version = '1'

  constructor(_config: TopshipAdapterConfig = {}) {}

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // For Topship the "code" is the API key itself.
    return exchangeApiKey(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new TopshipClient(credentials)
    // API: GET /get-shipments?filter={take,page,...}. Docs: "Filters include
    // dateRange, keyword, isPaid, take and page."; the response carries
    // totalPages, currentPage and totalCount beside `list`. No maximum `take`
    // is documented; the 100 clamp is kept and reported as pageSize when it bites.
    const requested = params.limit ?? DEFAULT_PAGE_SIZE
    const take = Math.min(requested, MAX_PAGE_SIZE)
    const page = params.page ?? 1
    const filter = JSON.stringify({ take, page })
    const res = await client.get<{
      list: TopshipShipment[]
      totalCount?: number
      totalPages?: number
      currentPage?: number
    }>('get-shipments', {
      filter,
    })
    const hasMore =
      typeof res.totalPages === 'number'
        ? page < res.totalPages
        : typeof res.totalCount === 'number'
          ? page * take < res.totalCount
          : undefined
    reportUpstreamPage(params, {
      ...(typeof res.totalCount === 'number' ? { totalCount: res.totalCount } : {}),
      ...(typeof res.totalPages === 'number' ? { totalPages: res.totalPages } : {}),
      ...(typeof res.currentPage === 'number' ? { currentPage: res.currentPage } : {}),
      ...(hasMore !== undefined ? { hasMore } : {}),
      ...(take < requested ? { pageSize: take } : {}),
    })
    return (res.list ?? []).map(transformShipment)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new TopshipClient(credentials)
    // API: GET /get-shipment/{id}
    const raw = await client.get<TopshipShipment>(`get-shipment/${id}`)
    return transformShipment(raw)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new TopshipClient(credentials)

    const senderDetail: Record<string, unknown> = {}
    if (data.originAddress) {
      senderDetail['name'] = data.originAddress.name ?? undefined
      senderDetail['email'] = data.originAddress.email ?? undefined
      senderDetail['phoneNumber'] = data.originAddress.phone ?? undefined
      senderDetail['addressLine1'] = data.originAddress.street1 ?? undefined
      senderDetail['addressLine2'] = data.originAddress.street2 ?? undefined
      senderDetail['city'] = data.originAddress.city ?? undefined
      senderDetail['state'] = data.originAddress.state ?? undefined
      senderDetail['country'] = data.originAddress.country ?? undefined
      senderDetail['countryCode'] = undefined
      senderDetail['postalCode'] = data.originAddress.postalCode ?? undefined
    }

    const receiverDetail: Record<string, unknown> = {}
    if (data.destinationAddress) {
      receiverDetail['name'] = data.destinationAddress.name ?? undefined
      receiverDetail['email'] = data.destinationAddress.email ?? undefined
      receiverDetail['phoneNumber'] = data.destinationAddress.phone ?? undefined
      receiverDetail['addressLine1'] = data.destinationAddress.street1 ?? undefined
      receiverDetail['addressLine2'] = data.destinationAddress.street2 ?? undefined
      receiverDetail['city'] = data.destinationAddress.city ?? undefined
      receiverDetail['state'] = data.destinationAddress.state ?? undefined
      receiverDetail['country'] = data.destinationAddress.country ?? undefined
      receiverDetail['countryCode'] = undefined
      receiverDetail['postalCode'] = data.destinationAddress.postalCode ?? undefined
    }

    // API: POST /save-shipment — books as draft
    const body = {
      shipment: [
        {
          senderDetail,
          receiverDetail,
          itemCollectionMode: 'DropOff',
          pricingTier: 'Budget',
          insuranceType: 'None',
          insuranceCharge: 0,
          discount: 0,
          shipmentRoute: 'Domestic',
          shipmentCharge: 0,
          pickupCharge: 0,
          valueAddedTaxCharge: 0,
          items: [
            {
              description: data.notes ?? 'Shipment item',
              weight: data.totalWeight?.value ?? 1,
              quantity: 1,
              value: data.cost?.amount ?? 0,
              category: 'Others',
            },
          ],
        },
      ],
    }

    const raw = await client.post<TopshipShipment>('save-shipment', body)
    return transformShipment(raw)
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new TopshipClient(credentials)
    // API: POST /cancel-shipment
    await client.post<unknown>('cancel-shipment', { id })
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new TopshipClient(credentials)
    // API: GET /track-shipment?trackingId=...
    const raw = await client.get<TopshipTracking>('track-shipment', {
      trackingId: trackingNumber,
    })
    return transformTracking(raw)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new TopshipClient(credentials)

    const totalWeight =
      params.packages.length > 0 && params.packages[0]?.weight
        ? params.packages[0].weight.value
        : 1

    // API: GET /get-shipment-rate?shipmentDetail={...}
    const shipmentDetail = JSON.stringify({
      senderDetails: {
        cityName: params.originAddress.city ?? '',
        countryCode: params.originAddress.country ?? '',
      },
      receiverDetails: {
        cityName: params.destinationAddress.city ?? '',
        countryCode: params.destinationAddress.country ?? '',
      },
      totalWeight,
    })

    const res = await client.get<TopshipRate[]>('get-shipment-rate', { shipmentDetail })
    return (res ?? []).map(transformRate)
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    const client = new TopshipClient(credentials)
    // Labels are accessible via the shipment record; the `label` field is a URL
    const raw = await client.get<TopshipShipment>(`get-shipment/${id}`)
    if (!raw.label) {
      throw new Error(`No label found on Topship shipment ${id}`)
    }
    return transformLabel(
      {
        shipment_id: raw.id ?? undefined,
        tracking_number: raw.trackingId ?? undefined,
        label_url: raw.label ?? undefined,
        created_at: raw.createdDate ?? undefined,
        updated_at: raw.updatedDate ?? undefined,
      },
      raw.id ?? undefined,
      raw.trackingId ?? undefined,
      undefined,
      raw.pricingTier ?? undefined,
    )
  }
}
