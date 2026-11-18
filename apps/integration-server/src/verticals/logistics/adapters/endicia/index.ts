import { pageLocally } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  RateRequestParams,
  QueryParams,
} from '../../adapter/interface'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Label } from '../../schema/label'
import type { Carrier } from '../../schema/carrier'
import type { Manifest } from '../../schema/manifest'

import {
  buildAuthUrl,
  exchangeCode as doExchangeCode,
  refreshCredentials as doRefresh,
  type EndiciaOAuthClient,
} from './auth'
import { EndiciaClient } from './client'

import { transformTracking, type EndiciaTrackingResponse } from './transform/tracking'
import { transformRate, type EndiciaRate } from './transform/rate'
import { transformLabel, type EndiciaLabel } from './transform/label'
import { transformCarrier, type EndiciaCarrierServicesResponse } from './transform/carrier'
import { transformManifest, type EndiciaManifest } from './transform/manifest'

// ── Resource coverage ──────────────────────────────────────────────────────
// Unavailable: order     — Endicia/SERA is a postage/label API; no order management endpoints exist
// Unavailable: shipment  — Endicia/SERA is a postage/label API; no shipment management endpoints exist
// Unavailable: warehouse — Endicia/SERA is a postage/label API; no warehouse endpoints exist

/**
 * Operator-level config. `clientId`, `clientSecret` and `redirectUri` are the
 * operator's SERA app registration; `sandbox` selects the documented staging
 * hosts for both the API and signin.
 */
export interface EndiciaAdapterConfig {
  clientId?: string
  clientSecret?: string
  redirectUri?: string
  sandbox?: boolean
}

export class EndiciaAdapter implements LogisticsAdapter {
  readonly platform = 'endicia'
  readonly version = '1'

  private readonly sandbox: boolean
  private readonly clientId: string | undefined
  private readonly clientSecret: string | undefined
  private readonly redirectUri: string | undefined

  constructor(config: EndiciaAdapterConfig = {}) {
    this.sandbox = config.sandbox === true
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
  }

  private oauthClient(): EndiciaOAuthClient {
    if (!this.clientId || !this.clientSecret) {
      throw new Error('endicia: clientId and clientSecret are required in adapter config')
    }
    return { clientId: this.clientId, clientSecret: this.clientSecret, sandbox: this.sandbox }
  }

  private registeredRedirectUri(): string {
    if (!this.redirectUri) {
      throw new Error('endicia: redirectUri is required in adapter config')
    }
    return this.redirectUri
  }

  private client(credentials: Credentials): EndiciaClient {
    return new EndiciaClient(credentials, { sandbox: this.sandbox })
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  /**
   * SERA documents a single scope, `offline_access`, which the URL always
   * requests; there is no scope to override, so `overrideScopes` is ignored.
   */
  getAuthUrl(state: string, overrideScopes?: string[]): string {
    if (!this.clientId) {
      throw new Error('endicia: clientId is required in adapter config to build the authorize URL')
    }
    return buildAuthUrl({
      clientId: this.clientId,
      redirectUri: this.registeredRedirectUri(),
      state,
      sandbox: this.sandbox,
      scopes: overrideScopes,
    })
  }

  /**
   * The token endpoint's `redirect_uri` "Must match the `redirect_uri` value
   * used in the /authorize call", which is the configured one, so the callback's
   * own value is not sent.
   */
  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return doExchangeCode(this.oauthClient(), code, this.registeredRedirectUri())
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(this.oauthClient(), credentials)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  /**
   * SERA `GET /v1/tracking` ("Track a Package"). Its documented query
   * parameters are `carrier` and `tracking_number`; the quick-start says
   * "Include a label_id or tracking_number in the request to specify the label
   * to track", so `carrier` is sent only when the caller names one.
   */
  async getTrackingEvents(
    credentials: Credentials,
    trackingNumber: string,
    carrier?: string,
  ): Promise<TrackingEvent[]> {
    const client = this.client(credentials)
    const raw = await client.get<EndiciaTrackingResponse>('tracking', {
      tracking_number: trackingNumber,
      ...(carrier ? { carrier } : {}),
    })
    return transformTracking(raw, trackingNumber, carrier)
  }

  // ── Rates ─────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = this.client(credentials)
    const raw = await client.post<{ rates: EndiciaRate[] }>('rates', {
      origin: params.originAddress,
      destination: params.destinationAddress,
      packages: params.packages,
      service_codes: params.serviceCodes,
    })
    return (raw.rates ?? []).map(transformRate)
  }

  // ── Labels ────────────────────────────────────────────────────────────────

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    const client = this.client(credentials)
    const raw = await client.post<EndiciaLabel>('labels', {
      tracking_number: data.trackingNumber,
      service_code: data.serviceCode,
      format: data.format ?? 'PDF',
    })
    return transformLabel(raw)
  }

  // ── Carriers ──────────────────────────────────────────────────────────────

  /**
   * SERA `GET /v1/carrier-services` ("Get All Available Carrier Services").
   * Its only parameter is the optional `ship_date`, and it answers with the
   * whole `shipping_options` array: no page, offset or cursor. The caller's
   * page is therefore sliced locally from that one response.
   */
  async listCarriers(credentials: Credentials, params: QueryParams): Promise<Carrier[]> {
    const client = this.client(credentials)
    const raw = await client.get<EndiciaCarrierServicesResponse>('carrier-services')
    return pageLocally((raw.shipping_options ?? []).map(transformCarrier), params)
  }

  // ── Manifests ─────────────────────────────────────────────────────────────

  async createManifest(credentials: Credentials, data: Partial<Manifest>): Promise<Manifest> {
    const client = this.client(credentials)
    const raw = await client.post<EndiciaManifest>('manifests', {
      label_ids: data.shipmentIds,
      carrier: data.carrierId,
    })
    return transformManifest(raw)
  }
}
