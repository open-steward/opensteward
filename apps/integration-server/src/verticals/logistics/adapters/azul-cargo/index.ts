// ── Resource coverage ──────────────────────────────────────────────
// Source: the Swagger 2.0 spec "EDI Azul Logistica Toolkit API's"
// (host ediapi.onlineapp.com.br, basePath /toolkit, e-mail/password login,
// token in the JSON body): https://ediapi.onlineapp.com.br/toolkit/swagger/docs/v1
// Served: getTrackingEvents — POST /api/Rastreio/Consultar {Token, Awb}.
// Refused (501): listTrackingEvents — the spec has no list or paging operation.
// Not implemented: rate (Cotacao/Enviar), shipment (EmissaoAWB/Enviar),
//   label (ImpressaoEtiqueta/EmitirEtiqueta), warehouse (Unidades/LocalizarUnidades)
//   are documented but this adapter has no methods for them.
// Unverified: carrier, manifest, order — no operation in the spec.

import type { LogisticsAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { TrackingEvent } from '../../schema/trackingevent'

import { AZUL_CARGO_FORM, buildAuthUrl, refreshCredentials as doRefresh } from './auth'
import { AzulCargoClient } from './client'

import { transformTracking, type AzulCargoRastreio } from './transform/tracking'

interface AzulCargoAdapterConfig {
  apiKey?: string
}

function notSupported(resource: string, reason: string): Error {
  return Object.assign(new Error(`Azul Cargo cannot list ${resource}: ${reason}`), {
    statusCode: 501,
    code: 'NOT_SUPPORTED',
  })
}

export class AzulCargoAdapter implements LogisticsAdapter {
  // Connect Link support — the toolkit's e-mail + password login.
  credentialFields = AZUL_CARGO_FORM.credentialFields
  exchangeCredentials = AZUL_CARGO_FORM.exchangeCredentials

  readonly platform = 'azul-cargo'
  readonly version = '1'

  constructor(_config: AzulCargoAdapterConfig = {}) {}

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    // There is no authorization code: the toolkit logs in with e-mail and
    // password (POST /api/Autenticacao/AutenticarUsuario {Email, Senha}).
    throw new Error(
      'Azul Cargo has no OAuth code exchange; connect with the e-mail and password form',
    )
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Webhook ────────────────────────────────────────────────────────────────

  verifyWebhook(_payload: Buffer, _headers: Record<string, string>, _secret: string): boolean {
    // Azul Cargo does not publish a documented webhook signature scheme.
    // Return false until a real verification algorithm is available.
    return false
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  /**
   * POST /api/Rastreio/Consultar — "operationId":"Rastreio_Consultar", body
   * RastreioRequestModel {"Token","Awb","ChaveNfe","Pedido"}. The tracking
   * number is sent as `Awb`.
   */
  async getTrackingEvents(
    credentials: Credentials,
    trackingNumber: string,
  ): Promise<TrackingEvent[]> {
    const client = new AzulCargoClient(credentials)
    const raw = await client.post<AzulCargoRastreio>('Rastreio/Consultar', {
      Awb: trackingNumber,
    })
    if (!Array.isArray(raw)) {
      // The spec's error envelope (JSON_RepostaPadrao: "ErrorText","HasErrors",
      // "Value") is documented for 400/401/500; surface its ErrorText if a 200
      // carries it rather than dropping the vendor's reason.
      const errorText = (raw as { ErrorText?: unknown } | null)?.ErrorText
      throw new Error(
        typeof errorText === 'string' && errorText !== ''
          ? `Azul Cargo Rastreio/Consultar failed: ${errorText}`
          : 'Azul Cargo Rastreio/Consultar did not return the documented array',
      )
    }
    return transformTracking(trackingNumber, raw)
  }

  async listTrackingEvents(
    _credentials: Credentials,
    _params: QueryParams,
  ): Promise<TrackingEvent[]> {
    throw notSupported(
      'tracking events',
      'the toolkit\'s only tracking operation is "POST /api/Rastreio/Consultar", a lookup of one shipment by "Awb", "ChaveNfe" or "Pedido"; the spec has no list or paging operation',
    )
  }
}
