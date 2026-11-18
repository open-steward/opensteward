/**
 * Total Express logistics adapter.
 *
 * Total Express is a Brazilian logistics operator providing parcel delivery
 * services across Brazil. This adapter covers:
 *   - Shipments (create, get)
 *   - Tracking events (get by shipment ID)
 *
 * Auth: HTTP Basic Auth.
 *   username = credentials.accessToken
 *   password = credentials.extra?.password ?? ''
 *
 * The Connect Link form collects username + password separately; the client
 * encodes them as a Base64 Basic Auth header on every request.
 *
 * Docs: https://www.totalexpress.com.br/desenvolvedores
 */

// ── Resource coverage ──────────────────────────────────────────────
// Unverified: carrier   — Official REST API docs (totalexpress.com.br/desenvolvedores) are
//                         inaccessible; public sources confirm only a SOAP webservice
//                         (edi.totalexpress.com.br) for shipment registration and tracking.
// Unverified: label     — No REST label endpoint found in any public source; Total Express
//                         label generation is part of the SOAP RegistraColeta flow only.
// Unverified: manifest  — No REST manifest endpoint found in any public source; SOAP API
//                         does not expose a distinct manifest resource.
// Unverified: order     — No REST order endpoint documented; SOAP covers shipment pickup
//                         registration only, not a separate order concept.
// Unverified: rate      — Freight calculation exists as SOAP at
//                         edi.totalexpress.com.br/webservice_calculo_frete.php; no REST
//                         rate endpoint documented.
// Unverified: warehouse — No warehouse endpoint found in any public source.
import { customForm } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'

import { buildAuthUrl, refreshCredentials as doRefresh } from './auth'
import { TotalExpressClient } from './client'
import {
  transformTracking,
  type TotalExpressShipment,
} from './transform/tracking'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mapShipmentStatus(status: string | undefined): Shipment['status'] {
  switch ((status ?? '').toUpperCase()) {
    case 'CRIADO':
    case 'PENDENTE':
    case 'AGUARDANDO_COLETA':
    case 'CREATED':
    case 'PENDING':
      return 'PENDING'
    case 'COLETADO':
    case 'EM_TRANSITO':
    case 'PICKED_UP':
    case 'IN_TRANSIT':
    case 'TRANSIT':
      return 'IN_TRANSIT'
    case 'SAIU_PARA_ENTREGA':
    case 'OUT_FOR_DELIVERY':
      return 'OUT_FOR_DELIVERY'
    case 'ENTREGUE':
    case 'DELIVERED':
      return 'DELIVERED'
    case 'DEVOLVIDO':
    case 'EM_DEVOLUCAO':
    case 'RETURNED':
    case 'RETURN_TO_SENDER':
      return 'RETURNED'
    case 'FALHOU':
    case 'NAO_ENTREGUE':
    case 'CANCELADO':
    case 'FAILED':
    case 'CANCELLED':
      return 'CANCELLED'
    default:
      return 'UNKNOWN'
  }
}

function transformShipment(raw: TotalExpressShipment): Shipment {
  return {
    id: raw.id != null ? String(raw.id) : undefined,
    trackingNumber: raw.numero_objeto ?? raw.tracking_number,
    carrierId: 'total-express',
    status: mapShipmentStatus(raw.status),
    createdAt: (raw.data_criacao ?? raw.created_at)
      ? new Date((raw.data_criacao ?? raw.created_at) as string)
      : undefined,
    updatedAt: (raw.data_atualizacao ?? raw.updated_at)
      ? new Date((raw.data_atualizacao ?? raw.updated_at) as string)
      : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

// ─── Connect Link credential form ────────────────────────────────────────────

const CREDENTIAL_FORM = customForm({
  fields: [
    {
      name: 'username',
      label: 'Username',
      type: 'text',
      required: true,
      helpText: 'Your Total Express API username.',
    },
    {
      name: 'password',
      label: 'Password',
      type: 'password',
      required: true,
      helpText: 'Your Total Express API password.',
    },
  ],
  exchange: async (fields: Record<string, string>): Promise<Credentials> => {
    const username = (fields['username'] ?? '').trim()
    const password = fields['password'] ?? ''
    if (!username) throw new Error('Username is required.')
    if (!password) throw new Error('Password is required.')
    return { accessToken: username, extra: { password } }
  },
})

// ─── Adapter ─────────────────────────────────────────────────────────────────

export class TotalExpressAdapter implements LogisticsAdapter {
  readonly platform = 'total-express'
  readonly version = '1'

  credentialFields = CREDENTIAL_FORM.credentialFields
  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // code is expected as "username:password"
    const idx = code.indexOf(':')
    if (idx === -1) throw new Error('TotalExpress exchangeCode expects code in "username:password" format')
    const username = code.slice(0, idx)
    const password = code.slice(idx + 1)
    return { accessToken: username, extra: { password } }
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  verifyWebhook(_payload: Buffer, _headers: Record<string, string>, _secret: string): boolean {
    return false
  }

  // ── Shipments ─────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new TotalExpressClient(credentials)
    const raw = await client.post<TotalExpressShipment>('/shipments', {
      referencia: data.reference,
      remetente: data.originAddress
        ? {
            nome: data.originAddress.name,
            empresa: data.originAddress.company,
            endereco: data.originAddress.street1,
            complemento: data.originAddress.street2,
            cidade: data.originAddress.city,
            estado: data.originAddress.state,
            cep: data.originAddress.postalCode,
            pais: data.originAddress.country,
            telefone: data.originAddress.phone,
            email: data.originAddress.email,
          }
        : undefined,
      destinatario: data.destinationAddress
        ? {
            nome: data.destinationAddress.name,
            empresa: data.destinationAddress.company,
            endereco: data.destinationAddress.street1,
            complemento: data.destinationAddress.street2,
            cidade: data.destinationAddress.city,
            estado: data.destinationAddress.state,
            cep: data.destinationAddress.postalCode,
            pais: data.destinationAddress.country,
            telefone: data.destinationAddress.phone,
            email: data.destinationAddress.email,
          }
        : undefined,
      peso: data.totalWeight?.value,
      observacoes: data.notes,
    })
    return transformShipment(raw)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new TotalExpressClient(credentials)
    const raw = await client.get<TotalExpressShipment>(
      `/shipments/${encodeURIComponent(id)}`,
    )
    return transformShipment(raw)
  }

  // ── Tracking Events ───────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, shipmentId: string): Promise<TrackingEvent[]> {
    const client = new TotalExpressClient(credentials)
    const raw = await client.get<TotalExpressShipment>(
      `/shipments/${encodeURIComponent(shipmentId)}`,
    )
    return transformTracking(raw)
  }
}
