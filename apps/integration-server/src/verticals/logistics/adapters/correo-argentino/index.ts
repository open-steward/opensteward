// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: carrier  — Correo Argentino is a single national carrier; no carrier-list endpoint exists in the MiCorreo v1 API
// Unavailable: manifest — No manifest endpoint in the MiCorreo v1 API (PAQ.AR v2 API, which may have manifests, requires a separate commercial agreement and is behind a login wall)
// Unavailable: order    — No order-list endpoint in the MiCorreo v1 API; /shipping/import creates shipments, not a separate order resource

import { simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  RateRequestParams,
  QueryParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Warehouse } from '../../schema/warehouse'
import type { Label } from '../../schema/label'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { CorreoArgentinoClient } from './client'

import { transformTracking, type CorreoArgentinoTrackingResponse } from './transform/tracking'
import { transformShipment, type CorreoArgentinoEnvio } from './transform/shipment'
import { transformRate, type CorreoArgentinoRateItem, type CorreoArgentinoRatesResponse } from './transform/rate'
import { transformWarehouse, type CorreoArgentinoAgency } from './transform/warehouse'
import { transformLabel } from './transform/label'

interface CorreoArgentinoAdapterConfig {
  sandbox?: boolean
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class CorreoArgentinoAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'correo-argentino'
  readonly version = '1'

  constructor(_config: CorreoArgentinoAdapterConfig = {}) {}

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
    const client = new CorreoArgentinoClient(credentials)
    const raw = await client.get<CorreoArgentinoTrackingResponse>(`tracking/${trackingNumber}`)
    return transformTracking(raw)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new CorreoArgentinoClient(credentials)
    const raw = await client.post<CorreoArgentinoEnvio>('envios', {
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
    const client = new CorreoArgentinoClient(credentials)
    const pkg = params.packages[0]
    const res = await client.post<CorreoArgentinoRatesResponse>('rates', {
      cp_origen: params.originAddress.postalCode,
      cp_destino: params.destinationAddress.postalCode,
      tipo_entrega: 'D',
      peso: pkg?.weight?.value,
      peso_unidad: pkg?.weight?.unit ?? 'kg',
    })
    return (res.tarifas ?? []).map((r: CorreoArgentinoRateItem) => transformRate(r))
  }

  // ── Warehouses (Sucursales/Agencies) ───────────────────────────────────────

  async listWarehouses(credentials: Credentials, _params: QueryParams): Promise<Warehouse[]> {
    const client = new CorreoArgentinoClient(credentials)
    const raw = await client.get<CorreoArgentinoAgency[]>('agencies')
    return (raw ?? []).map(transformWarehouse)
  }

  async getWarehouse(credentials: Credentials, id: string): Promise<Warehouse> {
    const client = new CorreoArgentinoClient(credentials)
    // The agencies endpoint filters by province; use sucursal_id match.
    const all = await client.get<CorreoArgentinoAgency[]>('agencies')
    const found = (all ?? []).find(
      (a) => String(a.sucursal_id ?? a.codigo ?? '') === id,
    )
    return transformWarehouse(found ?? ({ sucursal_id: id } as CorreoArgentinoAgency))
  }

  // ── Labels (derived from envio response) ──────────────────────────────────

  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    const client = new CorreoArgentinoClient(credentials)
    const raw = await client.get<CorreoArgentinoEnvio>(`envios/${id}`)
    return transformLabel(raw)
  }
}
