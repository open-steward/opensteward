// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: carrier  — Andreani is a single carrier; no carrier-list endpoint exists in the API
// Unavailable: manifest — No manifiestos endpoint in the Andreani REST API (confirmed via SDK research)

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
import type { Order } from '../../schema/order'
import type { Label } from '../../schema/label'
import type { Warehouse } from '../../schema/warehouse'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { AndreaniClient } from './client'

import { transformTracking, type AndreaniTrackingResponse } from './transform/tracking'
import { transformShipment, type AndreaniShipment } from './transform/shipment'
import { transformRate, type AndreaniRate } from './transform/rate'
import { transformOrder, type AndreaniOrden } from './transform/order'
import { transformLabel, type AndreaniLabelOrden } from './transform/label'
import { transformWarehouse, type AndreaniSucursal } from './transform/warehouse'

interface AndreaniAdapterConfig {
  sandbox?: boolean
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class AndreaniAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'andreani'
  readonly version = '1'

  constructor(_config: AndreaniAdapterConfig = {}) {}

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
    const client = new AndreaniClient(credentials)
    const raw = await client.get<AndreaniTrackingResponse>(`envios/${trackingNumber}/trazas`)
    return transformTracking(raw)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new AndreaniClient(credentials)
    const raw = await client.post<AndreaniShipment>('ordenes-de-envio', {
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
          }
        : undefined,
      peso: data.totalWeight?.value,
      peso_unidad: data.totalWeight?.unit ?? 'kg',
      servicio: data.serviceCode,
      referencia: data.reference,
    })
    return transformShipment(raw)
  }

  // ── Orders ─────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, _params: QueryParams): Promise<Order[]> {
    // Andreani does not expose a paginated order-list endpoint; return empty.
    void credentials
    return []
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new AndreaniClient(credentials)
    const raw = await client.get<AndreaniOrden>(`ordenes-de-envio/${id}`)
    return transformOrder(raw)
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    const client = new AndreaniClient(credentials)
    // Fetch the order to get bulto/etiqueta metadata (PDF is at etiqueta URL).
    const raw = await client.get<AndreaniLabelOrden>(`ordenes-de-envio/${id}`)
    return transformLabel(raw)
  }

  // ── Warehouses (Sucursales) ─────────────────────────────────────────────────

  async listWarehouses(credentials: Credentials, _params: QueryParams): Promise<Warehouse[]> {
    const client = new AndreaniClient(credentials)
    const raw = await client.get<AndreaniSucursal[]>('sucursales')
    return (raw ?? []).map(transformWarehouse)
  }

  async getWarehouse(credentials: Credentials, id: string): Promise<Warehouse> {
    const client = new AndreaniClient(credentials)
    const raw = await client.get<AndreaniSucursal>(`sucursales/${id}`)
    return transformWarehouse(raw)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new AndreaniClient(credentials)
    const res = await client.post<{ tarifas: AndreaniRate[] }>('tarifas', {
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
    return (res.tarifas ?? []).map(transformRate)
  }
}
