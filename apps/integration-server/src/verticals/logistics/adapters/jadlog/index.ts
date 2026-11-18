// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: manifest — Jadlog Embarcador API has no manifesto/end-of-day manifest endpoint
// Unavailable: order    — Jadlog's pedido (order) concept is implemented as shipment; no separate order lifecycle endpoint exists

import { pageLocally, simpleApiKey } from '@opensteward/shared'
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
import type { Warehouse } from '../../schema/warehouse'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { JadlogClient } from './client'
import { JADLOG_PUDOS_URL, JADLOG_PUDO_TYPES } from './constants'

import { transformShipment, type JadlogShipment } from './transform/shipment'
import { transformTracking, type JadlogTrackingResponse } from './transform/tracking'
import { transformRate, type JadlogFreteResponse } from './transform/rate'
import { transformLabel, type JadlogLabelResponse } from './transform/label'
import { transformCarrier } from './transform/carrier'
import {
  transformWarehouse,
  type JadlogPudo,
  type JadlogPudosResponse,
} from './transform/warehouse'

/**
 * Refuse a list the Jadlog API cannot serve, before any request is sent.
 */
function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

/**
 * Documento de Integração v2.3, "Consulta do Tracking" (p. 15): the request
 * table's only top-level field is `consulta`, "Grupo de itens para consulta",
 * occurring "1-20", each item naming a `cte`, `shipmentId`, `codigo`, `pedido`
 * or `df`. It is a lookup of known ids with no list or paging parameter.
 */
const TRACKING_IS_A_LOOKUP =
  'POST /embarcador/api/tracking/consultar is a lookup of 1-20 known ids ' +
  '("consulta": "Grupo de itens para consulta", Ocorr. 1-20, each item a cte, shipmentId, ' +
  'codigo, pedido or df) and Jadlog documents no list or paging endpoint'

interface JadlogAdapterConfig {
  // Reserved for future per-instance configuration (e.g. default CNPJ / account).
  cnpj?: string
  conta?: string
}

const SIMPLE_API_KEY_FORM = simpleApiKey()

/**
 * Jadlog Embarcador API adapter.
 *
 * Jadlog (a DPD Brazil affiliate) is a major Brazilian parcel and freight
 * carrier. This adapter targets the Embarcador REST API (v2):
 *
 *   Base URL: https://www.jadlog.com.br/embarcador/api
 *   Auth:     Bearer token (obtained from the Jadlog commercial department)
 *
 * Supported capabilities:
 *   - Shipment creation and retrieval
 *   - Freight rate simulation (cotação)
 *   - Tracking consultation (rastreamento)
 *   - DACTE / label retrieval
 *   - Shipment cancellation
 *
 * Jadlog does not publish a documented webhook signing scheme, so webhook
 * verification is not implemented.
 */
export class JadlogAdapter implements LogisticsAdapter {
  // Connect Link support — single API-key credential form.
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'jadlog'
  readonly version = '1'

  constructor(private readonly config: JadlogAdapterConfig = {}) {}

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

  async listShipments(_credentials: Credentials, _params: QueryParams): Promise<Shipment[]> {
    throw notSupported(`Jadlog cannot list shipments: ${TRACKING_IS_A_LOOKUP}`)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new JadlogClient(credentials)
    const res = await client.post<JadlogShipment>('/pedido/consultar', { idpedido: id })
    return transformShipment(res)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new JadlogClient(credentials)

    const body = {
      shipment: {
        conta: this.config.conta,
        cnpj: this.config.cnpj,
        nrpedido: data.reference,
        modalidade: data.serviceCode != null ? Number(data.serviceCode) : 4,
        peso: data.totalWeight?.value,
        // Origin / destination are supplied as postal codes for Jadlog
        cepori: data.originAddress?.postalCode?.replace(/\D/g, ''),
        cepdes: data.destinationAddress?.postalCode?.replace(/\D/g, ''),
        nomeRemetente: data.originAddress?.name ?? data.originAddress?.company,
        enderecoRemetente: data.originAddress?.street1,
        bairroRemetente: data.originAddress?.street2,
        cidadeRemetente: data.originAddress?.city,
        ufRemetente: data.originAddress?.state,
        nomeDestinatario: data.destinationAddress?.name ?? data.destinationAddress?.company,
        enderecoDestinatario: data.destinationAddress?.street1,
        bairroDestinatario: data.destinationAddress?.street2,
        cidadeDestinatario: data.destinationAddress?.city,
        ufDestinatario: data.destinationAddress?.state,
      },
    }

    const res = await client.post<JadlogShipment>('/pedido/incluir', body)
    return transformShipment(res)
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new JadlogClient(credentials)
    await client.post<unknown>('/pedido/cancelar', { idpedido: id })
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(
    credentials: Credentials,
    trackingNumber: string,
  ): Promise<TrackingEvent[]> {
    const client = new JadlogClient(credentials)
    // Jadlog tracking can be queried by codigo, cte, nrpedido, or shipmentId.
    const res = await client.post<JadlogTrackingResponse>('/tracking/consultar', {
      codigo: trackingNumber,
    })
    return transformTracking(res)
  }

  async listTrackingEvents(
    _credentials: Credentials,
    _params: QueryParams,
  ): Promise<TrackingEvent[]> {
    throw notSupported(`Jadlog cannot list tracking events: ${TRACKING_IS_A_LOOKUP}`)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new JadlogClient(credentials)

    // Build one quote request per requested service code (modality), or a
    // single request with the default Package modality when none are specified.
    const modalities: number[] =
      params.serviceCodes && params.serviceCodes.length > 0
        ? params.serviceCodes.map(Number).filter((n) => !isNaN(n))
        : [4] // default: Package

    const rates = await Promise.all(
      modalities.map(async (modalidade): Promise<Rate> => {
        const body = {
          cepori: params.originAddress.postalCode?.replace(/\D/g, ''),
          cepdes: params.destinationAddress.postalCode?.replace(/\D/g, ''),
          peso: params.packages[0]?.weight?.value,
          cnpj: this.config.cnpj,
          conta: this.config.conta,
          modalidade,
          tpentrega: 'D',
          tpseguro: 'N',
          vldeclarado: 0,
          vlcoleta: 0,
          frap: 'N',
        }
        const res = await client.post<JadlogFreteResponse>('/frete/valor', body)
        return transformRate({ ...res, modalidade })
      }),
    )

    return rates
  }

  // ── Carriers ───────────────────────────────────────────────────────────────

  async listCarriers(_credentials: Credentials, _params: QueryParams): Promise<Carrier[]> {
    return [transformCarrier()]
  }

  async getCarrier(_credentials: Credentials, _id: string): Promise<Carrier> {
    return transformCarrier()
  }

  // ── Warehouses (PUDO pickup points) ────────────────────────────────────────

  /**
   * The whole PUDO network. Documento de Integração v2.3, "Consulta Pickup
   * Points Diário" (pp. 24-25): "A API em REST com retorno em JSON que lista os
   * PUDOS ativos em toda a rede PICKUP/JADLOG." and "1) Retorno para todos os
   * Pudos / Endpoint: https://www.jadlog.com.br/pickup/address/pudos?tipos=LOCKER,PUBLICO,JADLOG".
   * The response is `{ "pudos": [...] }` with no page, offset or cursor, so the
   * caller's page is sliced locally.
   */
  private async fetchPudos(credentials: Credentials): Promise<JadlogPudo[]> {
    const client = new JadlogClient(credentials)
    const res = await client.get<JadlogPudosResponse>(JADLOG_PUDOS_URL, {
      tipos: JADLOG_PUDO_TYPES,
    })
    // An envelope without the documented `pudos` array (for example an error
    // body sent with HTTP 200) must not read as an empty, complete network:
    // pageLocally would then tell the sync to drop every cached PUDO.
    if (!Array.isArray(res?.pudos)) {
      throw new Error('Jadlog PUDO response has no "pudos" array')
    }
    return res.pudos
  }

  async listWarehouses(credentials: Credentials, params: QueryParams): Promise<Warehouse[]> {
    return pageLocally((await this.fetchPudos(credentials)).map(transformWarehouse), params)
  }

  /**
   * Jadlog documents no PUDO-by-id lookup, so this reads the network list and
   * transforms only the matching row.
   */
  async getWarehouse(credentials: Credentials, id: string): Promise<Warehouse> {
    const raw = (await this.fetchPudos(credentials)).find((p) => p.pudoId === id)
    const match = raw ? transformWarehouse(raw) : undefined
    if (!match) {
      throw Object.assign(new Error(`Jadlog PUDO not found: ${id}`), {
        statusCode: 404,
        code: 'NOT_FOUND',
      })
    }
    return match
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    const client = new JadlogClient(credentials)
    // DACTE/label retrieval — query by shipment/order ID.
    const res = await client.post<JadlogLabelResponse>('/etiqueta/consultar', { idpedido: id })
    return transformLabel(res)
  }

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    if (!data.shipmentId) throw new Error('shipmentId is required to emit a Jadlog label')
    const client = new JadlogClient(credentials)
    const res = await client.post<JadlogLabelResponse>('/etiqueta/incluir', {
      idpedido: data.shipmentId,
    })
    return transformLabel(res)
  }
}
