import { oauth2ClientCredentials } from '@opensteward/shared'
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

import {
  buildAuthUrl,
  exchangeClientCredentials,
  refreshCredentials as doRefresh,
} from './auth'
import { CargoOneClient } from './client'
import { CARGO_ONE_TOKEN_URL, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformShipment, type CargoOneShipment } from './transform/shipment'
import { transformTrackingEvents, type CargoOneTrackingResponse } from './transform/tracking'
import { transformRate, type CargoOneRate } from './transform/rate'
import { transformLabel, type CargoOneLabel } from './transform/label'
import { transformCarrier, type CargoOneCarrier } from './transform/carrier'

// ── Resource coverage ──────────────────────────────────────────────────────────
// Unverified: manifest  — API docs require partner auth; platform public surface (rates/booking/tracking) has no manifest concept
// Unverified: order     — API docs require partner auth; platform public surface (rates/booking/tracking) has no order concept
// Unverified: warehouse — API docs require partner auth; platform public surface (rates/booking/tracking) has no warehouse concept

// ── Connect Link credential form (client_credentials OAuth2) ─────────────────

const CREDENTIAL_FORM = oauth2ClientCredentials({
  tokenUrl: CARGO_ONE_TOKEN_URL,
  buildExtra: (input) => ({
    clientId: input['clientId'] ?? '',
    clientSecret: input['clientSecret'] ?? '',
  }),
})

// ── Adapter config ────────────────────────────────────────────────────────────

export interface CargoOneAdapterConfig {
  clientId?: string
  clientSecret?: string
  redirectUri?: string
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class CargoOneAdapter implements LogisticsAdapter {
  readonly platform = 'cargo-one'
  readonly version = '1'

  // Connect Link support — client_credentials OAuth2 form.
  credentialFields = CREDENTIAL_FORM.credentialFields
  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  private clientId: string
  private clientSecret: string

  constructor(config: CargoOneAdapterConfig = {}) {
    this.clientId = config.clientId ?? ''
    this.clientSecret = config.clientSecret ?? ''
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    // cargo.one uses client_credentials, not authorization code.
    // The "code" is interpreted as "clientId:clientSecret" (colon-separated)
    // to allow legacy adapter wiring. Prefer using exchangeCredentials directly.
    const [id, ...rest] = _code.split(':')
    const secret = rest.join(':')
    if (id && secret) {
      return exchangeClientCredentials(id, secret)
    }
    return exchangeClientCredentials(this.clientId, this.clientSecret)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new CargoOneClient(credentials)
    const res = await client.get<{ data: CargoOneShipment[]; items?: CargoOneShipment[] }>(
      '/shipments',
      {
        limit: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
        ...(params.updatedAfter ? { updated_after: params.updatedAfter.toISOString() } : {}),
        ...(params.cursor ? { cursor: params.cursor } : {}),
      },
    )
    const list = res.data ?? res.items ?? []
    return list.map(transformShipment)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new CargoOneClient(credentials)
    const raw = await client.get<CargoOneShipment>(`/shipments/${id}`)
    return transformShipment(raw)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new CargoOneClient(credentials)
    const raw = await client.post<CargoOneShipment>('/shipments', {
      reference: data.reference ?? undefined,
      mode: data.mode ?? undefined,
      origin: data.originAddress
        ? {
            name: data.originAddress.name,
            company: data.originAddress.company,
            street: data.originAddress.street1,
            street2: data.originAddress.street2,
            city: data.originAddress.city,
            state: data.originAddress.state,
            postal_code: data.originAddress.postalCode,
            country_code: data.originAddress.country,
            phone: data.originAddress.phone,
            email: data.originAddress.email,
          }
        : undefined,
      destination: data.destinationAddress
        ? {
            name: data.destinationAddress.name,
            company: data.destinationAddress.company,
            street: data.destinationAddress.street1,
            street2: data.destinationAddress.street2,
            city: data.destinationAddress.city,
            state: data.destinationAddress.state,
            postal_code: data.destinationAddress.postalCode,
            country_code: data.destinationAddress.country,
            phone: data.destinationAddress.phone,
            email: data.destinationAddress.email,
          }
        : undefined,
      weight: data.totalWeight?.value ?? undefined,
      weight_unit: data.totalWeight?.unit ?? undefined,
      notes: data.notes ?? undefined,
    })
    return transformShipment(raw)
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new CargoOneClient(credentials)
    await client.patch<unknown>(`/shipments/${id}`, { status: 'cancelled' })
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(
    credentials: Credentials,
    trackingNumber: string,
  ): Promise<TrackingEvent[]> {
    const client = new CargoOneClient(credentials)
    const raw = await client.get<CargoOneTrackingResponse>('/tracking', {
      tracking_number: trackingNumber,
    })
    return transformTrackingEvents(raw)
  }

  async listTrackingEvents(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<TrackingEvent[]> {
    const client = new CargoOneClient(credentials)
    const res = await client.get<{
      data: CargoOneTrackingResponse[]
      items?: CargoOneTrackingResponse[]
    }>('/tracking', {
      limit: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      ...(params.updatedAfter ? { updated_after: params.updatedAfter.toISOString() } : {}),
      ...(params.cursor ? { cursor: params.cursor } : {}),
    })
    const list = res.data ?? res.items ?? []
    return list.flatMap(transformTrackingEvents)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new CargoOneClient(credentials)
    const res = await client.post<{ data: CargoOneRate[]; rates?: CargoOneRate[] }>(
      '/rates',
      {
        origin: {
          city: params.originAddress.city,
          postal_code: params.originAddress.postalCode,
          country_code: params.originAddress.country,
        },
        destination: {
          city: params.destinationAddress.city,
          postal_code: params.destinationAddress.postalCode,
          country_code: params.destinationAddress.country,
        },
        weight: params.packages[0]?.weight?.value ?? undefined,
        weight_unit: params.packages[0]?.weight?.unit ?? undefined,
        service_codes: params.serviceCodes ?? undefined,
      },
    )
    const list = res.data ?? res.rates ?? []
    return list.map(transformRate)
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    const client = new CargoOneClient(credentials)
    const raw = await client.get<CargoOneLabel>(`/labels/${id}`)
    return transformLabel(raw)
  }

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    const client = new CargoOneClient(credentials)
    const raw = await client.post<CargoOneLabel>('/labels', {
      shipment_id: data.shipmentId ?? undefined,
      format: data.format ?? 'PDF',
      ...(data.metadata as Record<string, unknown> | undefined),
    })
    return transformLabel(raw)
  }

  async voidLabel(credentials: Credentials, id: string): Promise<void> {
    const client = new CargoOneClient(credentials)
    await client.patch<unknown>(`/labels/${id}`, { status: 'voided' })
  }

  // ── Carriers ───────────────────────────────────────────────────────────────

  async listCarriers(credentials: Credentials, params: QueryParams): Promise<Carrier[]> {
    const client = new CargoOneClient(credentials)
    const res = await client.get<{ data?: CargoOneCarrier[]; items?: CargoOneCarrier[] }>(
      '/carriers',
      {
        limit: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
        ...(params.cursor ? { cursor: params.cursor } : {}),
      },
    )
    const list = res.data ?? res.items ?? []
    return list.map(transformCarrier)
  }

  async getCarrier(credentials: Credentials, id: string): Promise<Carrier> {
    const client = new CargoOneClient(credentials)
    const raw = await client.get<CargoOneCarrier>(`/carriers/${id}`)
    return transformCarrier(raw)
  }
}
