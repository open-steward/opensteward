// ── Resource coverage ──────────────────────────────────────────────────────
// Available:   rate, shipment, trackingevent
// Unverified:  carrier   — developer portal requires authenticated login; no public REST endpoint confirmed
// Unverified:  label     — developer portal requires authenticated login; SOAP CargueMasivoExterno creates guides but no public label URL/base64 schema documented
// Unverified:  manifest  — developer portal requires authenticated login; no public planilla REST endpoint confirmed
// Unverified:  order     — developer portal requires authenticated login; Servientrega is a carrier, not an OMS; no public order endpoint confirmed
// Unverified:  warehouse — developer portal requires authenticated login; no public bodega REST endpoint confirmed

import { simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  RateRequestParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { ServientregaClient } from './client'

import { transformTracking, type ServientregaTrackingResponse } from './transform/tracking'
import { transformShipment, type ServientregaEnvio } from './transform/shipment'
import { transformRate, type ServientregaRate } from './transform/rate'

interface ServientregaAdapterConfig {
  sandbox?: boolean
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class ServientregaAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'servientrega'
  readonly version = '1'

  constructor(_config: ServientregaAdapterConfig = {}) {}

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

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new ServientregaClient(credentials)
    const raw = await client.get<ServientregaTrackingResponse>(`tracking/${trackingNumber}`)
    return transformTracking(raw)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new ServientregaClient(credentials)
    const raw = await client.post<ServientregaEnvio>('envios', {
      remitente: data.originAddress
        ? {
            name: data.originAddress.name,
            company: data.originAddress.company,
            address_line1: data.originAddress.street1,
            address_line2: data.originAddress.street2,
            city: data.originAddress.city,
            state: data.originAddress.state,
            postal_code: data.originAddress.postalCode,
            country: data.originAddress.country,
            phone: data.originAddress.phone,
            email: data.originAddress.email,
          }
        : undefined,
      destinatario: data.destinationAddress
        ? {
            name: data.destinationAddress.name,
            company: data.destinationAddress.company,
            address_line1: data.destinationAddress.street1,
            address_line2: data.destinationAddress.street2,
            city: data.destinationAddress.city,
            state: data.destinationAddress.state,
            postal_code: data.destinationAddress.postalCode,
            country: data.destinationAddress.country,
            phone: data.destinationAddress.phone,
            email: data.destinationAddress.email,
          }
        : undefined,
      peso: data.totalWeight?.value,
      peso_unidad: data.totalWeight?.unit ?? 'kg',
      servicio: data.serviceCode,
      referencia: data.reference,
    })
    return transformShipment(raw)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new ServientregaClient(credentials)
    const res = await client.post<{ cotizaciones: ServientregaRate[] }>('cotizaciones', {
      origen: {
        postal_code: params.originAddress.postalCode,
        city: params.originAddress.city,
        state: params.originAddress.state,
        country: params.originAddress.country,
      },
      destino: {
        postal_code: params.destinationAddress.postalCode,
        city: params.destinationAddress.city,
        state: params.destinationAddress.state,
        country: params.destinationAddress.country,
      },
      bultos: params.packages.map((pkg) => ({
        peso: pkg.weight?.value,
        peso_unidad: pkg.weight?.unit ?? 'kg',
      })),
    })
    return (res.cotizaciones ?? []).map(transformRate)
  }
}
