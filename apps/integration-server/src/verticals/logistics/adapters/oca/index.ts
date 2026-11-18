// ── Resource coverage ──────────────────────────────────────────────
// Unverified: carrier   — api.oca.com.ar/v1 is not publicly accessible; no documented REST carriers endpoint on OCA's developer portal
// Unverified: manifest  — no manifest endpoint found in OCA's REST or ePak SOAP APIs; developers.oca.com.ar does not expose a manifest resource
// Unverified: order     — ePak SOAP exposes IngresoORMultiplesRetiros (XML) but no equivalent /orders endpoint is confirmed in the modern REST API
// Unverified: rate      — ePak SOAP exposes Tarifar_Envio_Corporativo but no /rates endpoint is confirmed in api.oca.com.ar/v1
// Unverified: warehouse — ePak SOAP exposes GetCentrosImposicionConServiciosByCP (branches by CP) but no /warehouses endpoint is confirmed in api.oca.com.ar/v1

import { simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Label } from '../../schema/label'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { OcaClient } from './client'

import { transformTracking, type OcaTrackingResponse } from './transform/tracking'
import { transformShipment, type OcaEnvio } from './transform/shipment'
import { transformLabel } from './transform/label'

interface OcaAdapterConfig {
  sandbox?: boolean
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class OcaAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'oca'
  readonly version = '1'

  constructor(_config: OcaAdapterConfig = {}) {}

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
    const client = new OcaClient(credentials)
    const raw = await client.get<OcaTrackingResponse>(`tracking/${trackingNumber}`)
    return transformTracking(raw)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new OcaClient(credentials)
    const raw = await client.post<OcaEnvio>('envios', {
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

  // ── Labels ─────────────────────────────────────────────────────────────────

  /**
   * OCA labels are generated as part of shipment creation; the label_url
   * is embedded in the shipment (envio) response. `getLabel` fetches the
   * shipment by ID and projects the label fields.
   */
  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    const client = new OcaClient(credentials)
    const raw = await client.get<OcaEnvio>(`envios/${id}`)
    return transformLabel(raw)
  }

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    if (!data.shipmentId) throw new Error('OCA createLabel requires a shipmentId')
    const client = new OcaClient(credentials)
    const raw = await client.get<OcaEnvio>(`envios/${data.shipmentId}`)
    return transformLabel(raw)
  }
}
