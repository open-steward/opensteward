// ── Resource coverage ──────────────────────────────────────────────
// Available:   rate, shipment, trackingevent
// Unavailable: carrier — Correos is a single-carrier postal service; no carrier discovery endpoint exists.
// Unavailable: manifest — Correos API does not expose a manifests endpoint; documented modules are preregister, labels, pickup requests, and trackpub only.
// Unverified:  label — Labels API confirmed on MuleSoft portal but endpoint paths and response fields require authenticated developer portal access (signed transport contract).
// Unverified:  order — Orders API listed on MuleSoft portal but endpoint paths and response fields require authenticated developer portal access (signed transport contract).
// Unverified:  warehouse — Warehouse API listed on MuleSoft portal but endpoint paths and response fields require authenticated developer portal access (signed transport contract).

import type {
  LogisticsAdapter,
  Credentials,
  RateRequestParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'

import { buildAuthUrl, exchangeCredentials, refreshCredentials as doRefresh } from './auth'
import { CorreosClient } from './client'

import { transformTrackingEvents, type CorreosTrackingResponse } from './transform/tracking'
import { transformShipment, type CorreosShipmentResponse } from './transform/shipment'
import { transformRate, type CorreosRatesResponse } from './transform/rate'

export interface CorreosAdapterConfig {
  clientId?: string
  clientSecret?: string
}

export class CorreosAdapter implements LogisticsAdapter {
  readonly platform = 'correos'
  readonly version = '1'

  private config: CorreosAdapterConfig

  constructor(config: CorreosAdapterConfig = {}) {
    this.config = config
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error('correos: clientId and clientSecret are required')
    }
    return exchangeCredentials({
      clientId: this.config.clientId,
      clientSecret: this.config.clientSecret,
    })
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new CorreosClient(credentials)

    const body = {
      origen: {
        codigoPostal: params.originAddress.postalCode,
        pais: params.originAddress.country,
      },
      destino: {
        codigoPostal: params.destinationAddress.postalCode,
        pais: params.destinationAddress.country,
      },
      peso: params.packages[0]?.weight
        ? { valor: params.packages[0].weight.value, unidad: params.packages[0].weight.unit }
        : undefined,
    }

    const res = await client.post<CorreosRatesResponse>('/tarifas', body)
    return (res.tarifas ?? []).map(transformRate)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new CorreosClient(credentials)
    const res = await client.get<CorreosTrackingResponse>(`/envios/${trackingNumber}/seguimiento`)
    return transformTrackingEvents(res)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new CorreosClient(credentials)

    const body = {
      codigoServicio: data.serviceCode,
      remitente: {
        nombre: data.originAddress?.name,
        empresa: data.originAddress?.company,
        direccion1: data.originAddress?.street1,
        direccion2: data.originAddress?.street2,
        localidad: data.originAddress?.city,
        provincia: data.originAddress?.state,
        codigoPostal: data.originAddress?.postalCode,
        pais: data.originAddress?.country,
        telefono: data.originAddress?.phone,
        email: data.originAddress?.email,
      },
      destinatario: {
        nombre: data.destinationAddress?.name,
        empresa: data.destinationAddress?.company,
        direccion1: data.destinationAddress?.street1,
        direccion2: data.destinationAddress?.street2,
        localidad: data.destinationAddress?.city,
        provincia: data.destinationAddress?.state,
        codigoPostal: data.destinationAddress?.postalCode,
        pais: data.destinationAddress?.country,
        telefono: data.destinationAddress?.phone,
        email: data.destinationAddress?.email,
      },
      peso: data.totalWeight
        ? { valor: data.totalWeight.value, unidad: data.totalWeight.unit }
        : undefined,
    }

    const res = await client.post<CorreosShipmentResponse>('/envios', body)
    return transformShipment(res)
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new CorreosClient(credentials)
    await client.delete(`/envios/${id}`)
  }
}
