import { simpleApiKey } from '@opensteward/shared'
import type { LogisticsAdapter, Credentials, QueryParams, RateRequestParams } from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Label } from '../../schema/label'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { GophrUkClient } from './client'
import {
  transformShipment,
  type GophrUkJob,
  type GophrUkJobListResponse,
} from './transform/shipment'
import { transformTrackingEvents, type GophrUkTrackingResponse } from './transform/tracking'
import { transformRate, type GophrUkQuoteResponse } from './transform/rate'
import { transformLabel, type GophrUkLabelResponse } from './transform/label'

/**
 * Shape of a single delivery item returned by GET /jobs/{job_id}.
 * Gophr embeds a `deliveries` array on the job object; each entry
 * carries a `delivery_id` needed for the events endpoint.
 */
interface GophrUkDeliveryRef {
  delivery_id?: string | null
  [key: string]: unknown
}

interface GophrUkJobWithDeliveries extends GophrUkJob {
  deliveries?: GophrUkDeliveryRef[]
}

const SIMPLE_API_KEY_FORM = simpleApiKey()

// ── Resource coverage ──────────────────────────────────────────────────────────
// Available:   shipment, trackingevent, rate, label
// Unavailable: carrier  — Gophr V2 API has no carrier management endpoints; it
//                         is a single-carrier service (Gophr itself)
// Unavailable: manifest — Gophr V2 API has no manifest/end-of-day close
//                         endpoints documented
// Unavailable: order    — Gophr V2 API has no order management resource;
//                         dispatching is done via Jobs (shipments)
// Unavailable: warehouse — Gophr V2 API has no warehouse/hub management endpoints

/**
 * Gophr UK adapter — V2 Commercial API.
 *
 * Authentication: API key passed via the `API-KEY` request header.
 * Base URL:       https://api.gophr.com/v2-commercial-api
 * Docs:           https://developers.gophr.com/docs/gophr-commercial-api
 */
export class GophrUkAdapter implements LogisticsAdapter {
  readonly platform = 'gophr-uk'
  readonly version = '1'

  // Connect Link support — single API-key credential form.
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
    const client = new GophrUkClient(credentials)
    const res = await client.get<GophrUkJobListResponse>('/jobs', {
      page: params.page,
      per_page: params.limit,
    })
    return (res.jobs ?? []).map(transformShipment)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new GophrUkClient(credentials)
    const raw = await client.get<GophrUkJob>(`/jobs/${id}`)
    return transformShipment(raw)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new GophrUkClient(credentials)
    const body: Record<string, unknown> = {
      external_id: data.reference ?? undefined,
      pickup_address: data.originAddress
        ? {
            address1: data.originAddress.street1 ?? undefined,
            address2: data.originAddress.street2 ?? undefined,
            city: data.originAddress.city ?? undefined,
            postcode: data.originAddress.postalCode ?? undefined,
            country_code: data.originAddress.country ?? undefined,
          }
        : undefined,
      delivery_address: data.destinationAddress
        ? {
            address1: data.destinationAddress.street1 ?? undefined,
            address2: data.destinationAddress.street2 ?? undefined,
            city: data.destinationAddress.city ?? undefined,
            postcode: data.destinationAddress.postalCode ?? undefined,
            country_code: data.destinationAddress.country ?? undefined,
          }
        : undefined,
    }
    const raw = await client.post<GophrUkJob>('/jobs', body)
    return transformShipment(raw)
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new GophrUkClient(credentials)
    await client.post<Record<string, unknown>>(`/jobs/${id}/cancel`, {})
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(
    credentials: Credentials,
    trackingNumber: string,
  ): Promise<TrackingEvent[]> {
    // Gophr V2 Commercial API does NOT expose event history at the job level.
    // Event history lives at GET /jobs/{job_id}/deliveries/{delivery_id}, so a
    // two-step lookup is required:
    //   1. GET /jobs/{job_id}        → find delivery_id(s) in response.deliveries[]
    //   2. GET /jobs/{job_id}/deliveries/{delivery_id}  → read events[]
    const client = new GophrUkClient(credentials)
    const job = await client.get<GophrUkJobWithDeliveries>(`/jobs/${trackingNumber}`)
    const deliveries = job.deliveries ?? []
    if (deliveries.length === 0) {
      return []
    }
    const allEvents: TrackingEvent[] = []
    for (const delivery of deliveries) {
      const deliveryId = delivery.delivery_id
      if (!deliveryId) continue
      const raw = await client.get<GophrUkTrackingResponse>(
        `/jobs/${trackingNumber}/deliveries/${deliveryId}`,
      )
      allEvents.push(...transformTrackingEvents(raw))
    }
    return allEvents
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new GophrUkClient(credentials)
    const body: Record<string, unknown> = {
      pickup_address: {
        address1: params.originAddress.street1 ?? undefined,
        address2: params.originAddress.street2 ?? undefined,
        city: params.originAddress.city ?? undefined,
        postcode: params.originAddress.postalCode ?? undefined,
        country_code: params.originAddress.country ?? undefined,
      },
      delivery_address: {
        address1: params.destinationAddress.street1 ?? undefined,
        address2: params.destinationAddress.street2 ?? undefined,
        city: params.destinationAddress.city ?? undefined,
        postcode: params.destinationAddress.postalCode ?? undefined,
        country_code: params.destinationAddress.country ?? undefined,
      },
      weight_kg: params.packages[0]?.weight?.unit === 'kg'
        ? params.packages[0].weight.value
        : params.packages[0]?.weight?.unit === 'lb'
          ? (params.packages[0].weight.value ?? 0) * 0.453592
          : undefined,
    }
    const raw = await client.post<GophrUkQuoteResponse>('/quotes', body)
    return [transformRate(raw)]
  }

  // ── Labels ─────────────────────────────────────────────────────────────────
  // Gophr V2 Commercial API: POST /jobs/{job_id}/deliveries/{delivery_id}/label
  // Returns a label URL for the given delivery. This requires knowing the
  // delivery_id, which is nested under a job; the `id` param is expected as
  // "{job_id}/{delivery_id}".

  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    // id format: "{job_id}/{delivery_id}"
    const [jobId, deliveryId] = id.split('/')
    const client = new GophrUkClient(credentials)
    const raw = await client.post<GophrUkLabelResponse>(
      `/jobs/${jobId}/deliveries/${deliveryId}/label`,
      {},
    )
    return transformLabel(raw, jobId)
  }

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    // data.shipmentId = jobId, data.id = deliveryId
    const jobId = data.shipmentId ?? ''
    const deliveryId = data.id ?? ''
    const client = new GophrUkClient(credentials)
    const raw = await client.post<GophrUkLabelResponse>(
      `/jobs/${jobId}/deliveries/${deliveryId}/label`,
      {},
    )
    return transformLabel(raw, jobId)
  }
}
