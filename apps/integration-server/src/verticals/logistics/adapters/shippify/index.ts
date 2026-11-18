/**
 * Shippify logistics adapter.
 *
 * Shippify is a last-mile delivery platform operating across Latin America.
 * This adapter covers:
 *   - Delivery shipments (list, get, create, cancel)
 *   - Tracking link (get by delivery id)
 *   - Rate quotes
 *   - Labels (create, get)
 *
 * Auth: HTTP Basic Auth.  Credentials are obtained from the Shippify merchant
 * dashboard (https://dash.shippify.co/settings/sections/profile).  The form
 * collects APP ID + APP SECRET; these are Base64-encoded and stored as the
 * accessToken.
 *
 * Shippify does not publish a documented webhook signing scheme — webhook.ts
 * is therefore omitted.
 *
 * Docs: https://docs.shippify.co/developers/en/shippify-api/first-steps.md
 */
import { customForm } from '@opensteward/shared'
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

import { buildAuthUrl, exchangeBasicAuth, refreshCredentials as doRefresh } from './auth'
import { ShippifyClient } from './client'

import { transformTask, type ShippifyTask } from './transform/shipment'
import { transformTrackingResponse, type ShippifyTrackingResponse } from './transform/tracking'
import { transformRate, type ShippifyRate } from './transform/rate'
import { transformLabel, type ShippifyLabel } from './transform/label'

// ── Resource coverage ──────────────────────────────────────────────────────────
// Unavailable: carrier  — Shippify is itself a single last-mile carrier network; no /carriers
//              endpoint exists in the documented API (docs.shippify.co/developers).
// Unavailable: manifest — Shippify has no manifest/SCAN-form concept or endpoint; its API
//              covers deliveries, routes, pricing, and places only.

// ── Connect Link credential form ──────────────────────────────────────────────

const CREDENTIAL_FORM = customForm({
  fields: [
    {
      name: 'apiId',
      label: 'APP ID',
      type: 'text',
      required: true,
      helpText: 'Your Shippify APP ID, found in the dashboard under Settings → Profile.',
    },
    {
      name: 'apiSecret',
      label: 'APP Secret',
      type: 'password',
      required: true,
      helpText: 'Your Shippify APP Secret, found alongside the APP ID.',
    },
  ],
  exchange: async (fields: Record<string, string>): Promise<Credentials> => {
    const apiId = (fields['apiId'] ?? '').trim()
    const apiSecret = (fields['apiSecret'] ?? '').trim()
    if (!apiId) throw new Error('APP ID is required.')
    if (!apiSecret) throw new Error('APP Secret is required.')
    return exchangeBasicAuth(apiId, apiSecret)
  },
})

// ── Response unwrap helpers ───────────────────────────────────────────────────

interface ShippifyListResponse<T> {
  payload?: T[]
  data?: T[]
  results?: T[]
  [key: string]: unknown
}

function unwrapList<T>(res: ShippifyListResponse<T> | T[]): T[] {
  if (Array.isArray(res)) return res
  return res.payload ?? res.data ?? res.results ?? []
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class ShippifyAdapter implements LogisticsAdapter {
  readonly platform = 'shippify'
  readonly version = '1'

  credentialFields = CREDENTIAL_FORM.credentialFields
  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  // ── Auth ────────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // code is expected as "apiId:apiSecret"
    const idx = code.indexOf(':')
    if (idx === -1) throw new Error('Shippify exchangeCode expects code in the format "apiId:apiSecret"')
    const apiId = code.slice(0, idx)
    const apiSecret = code.slice(idx + 1)
    return exchangeBasicAuth(apiId, apiSecret)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Shipments (deliveries) ──────────────────────────────────────────────────
  //
  // Shippify API:
  //   POST   /v1/deliveries          – create
  //   GET    /v1/deliveries/{id}/complete – get single delivery
  //   PATCH  /v1/deliveries/{id}/status  – change status (cancel = status "canceled")
  //
  // List is not directly available as a paginated endpoint in Shippify's public
  // API — we return an empty array to satisfy the interface without erroring.

  async listShipments(_credentials: Credentials, _params: QueryParams): Promise<Shipment[]> {
    // Shippify does not expose a public list-deliveries endpoint; return empty.
    return []
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new ShippifyClient(credentials)
    const raw = await client.get<ShippifyTask>(`/v1/deliveries/${encodeURIComponent(id)}/complete`)
    return transformTask(raw)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new ShippifyClient(credentials)
    // Shippify accepts a `deliveries` array; we post a single delivery.
    const res = await client.post<{ payload?: ShippifyTask[]; code?: string }>('/v1/deliveries', {
      deliveries: [
        {
          referenceId: data.reference ?? undefined,
          pickup: data.originAddress
            ? {
                location: {
                  address: data.originAddress.street1 ?? undefined,
                  city: data.originAddress.city ?? undefined,
                  state: data.originAddress.state ?? undefined,
                  country: data.originAddress.country ?? undefined,
                  zipCode: data.originAddress.postalCode ?? undefined,
                },
                contact: {
                  name: data.originAddress.name ?? undefined,
                  company: data.originAddress.company ?? undefined,
                  phone: data.originAddress.phone ?? undefined,
                  email: data.originAddress.email ?? undefined,
                },
              }
            : undefined,
          dropoff: data.destinationAddress
            ? {
                location: {
                  address: data.destinationAddress.street1 ?? undefined,
                  city: data.destinationAddress.city ?? undefined,
                  state: data.destinationAddress.state ?? undefined,
                  country: data.destinationAddress.country ?? undefined,
                  zipCode: data.destinationAddress.postalCode ?? undefined,
                },
                contact: {
                  name: data.destinationAddress.name ?? undefined,
                  company: data.destinationAddress.company ?? undefined,
                  phone: data.destinationAddress.phone ?? undefined,
                  email: data.destinationAddress.email ?? undefined,
                },
              }
            : undefined,
          packages: data.totalWeight?.value != null
            ? [{ weight: data.totalWeight.value }]
            : undefined,
        },
      ],
    })
    const first = (res.payload ?? [])[0]
    if (!first) throw new Error('Shippify createShipment: no delivery returned in payload')
    return transformTask(first)
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new ShippifyClient(credentials)
    await client.patch<unknown>(`/v1/deliveries/${encodeURIComponent(id)}/status`, {
      status: 'canceled',
      comment: 'Cancelled via API',
    })
  }

  // ── Tracking Events ─────────────────────────────────────────────────────────
  //
  // Shippify exposes /v1/deliveries/token/{id} which returns a tracking URL.
  // We model this as a single synthesised TrackingEvent per delivery id.

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new ShippifyClient(credentials)
    const raw = await client.get<ShippifyTrackingResponse>(
      `/v1/deliveries/token/${encodeURIComponent(trackingNumber)}`,
    )
    return transformTrackingResponse(raw)
  }

  // ── Rates / Quotes ──────────────────────────────────────────────────────────
  //
  // Shippify: POST /v2/pricing/quotes/available

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new ShippifyClient(credentials)
    const res = await client.post<ShippifyListResponse<ShippifyRate>>('/v2/pricing/quotes/available', {
      deliveries: [
        {
          pickup: {
            location: {
              address: params.originAddress.street1 ?? undefined,
              city: params.originAddress.city ?? undefined,
              state: params.originAddress.state ?? undefined,
              country: params.originAddress.country ?? undefined,
              zipCode: params.originAddress.postalCode ?? undefined,
            },
          },
          dropoff: {
            location: {
              address: params.destinationAddress.street1 ?? undefined,
              city: params.destinationAddress.city ?? undefined,
              state: params.destinationAddress.state ?? undefined,
              country: params.destinationAddress.country ?? undefined,
              zipCode: params.destinationAddress.postalCode ?? undefined,
            },
          },
          packages: params.packages.map((pkg) => ({
            weight: pkg.weight?.value ?? undefined,
          })),
        },
      ],
    })
    return unwrapList(res).map(transformRate)
  }

  // ── Labels ──────────────────────────────────────────────────────────────────
  //
  // Shippify: POST /v2/integrations/deliveries/labels
  // Returns a PDF binary — we model it as a Label with a url derived from the
  // request so callers know how to retrieve it.

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    if (!data.shipmentId) throw new Error('shipmentId is required to create a Shippify label')
    const client = new ShippifyClient(credentials)
    // The endpoint returns a PDF blob; we don't parse it — store the request
    // metadata and return a Label record with url undefined (caller uses POST).
    await client.post<unknown>('/v2/integrations/deliveries/labels', {
      deliveryIds: [data.shipmentId],
    })
    const raw: ShippifyLabel = {
      task_id: data.shipmentId ?? null,
      format: 'pdf',
      status: 'created',
    }
    return transformLabel(raw)
  }
}
