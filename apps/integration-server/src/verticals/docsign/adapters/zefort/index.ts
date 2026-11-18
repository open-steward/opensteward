/**
 * Zefort adapter — contract-management + e-signature platform.
 *
 * Maps Zefort signing requests ("esigns", id prefix `esgn_`) → canonical
 * `Envelope`, their nested `parties` (`sgnr_`) → `Signer`, and their nested
 * `documents` (`esdc_`, metadata only) → `Document`.
 *
 * Auth is a single long-lived API key supplied via HTTP Basic (key as the
 * username, empty password). A Zefort instance is addressed by its own
 * hostname, so the Connect Link form also collects the instance host; both
 * values are collected via the shared `customForm` template and persisted on
 * the credentials. There is no OAuth and no refresh.
 *
 * Zefort exposes no template resource and no per-esign audit/event/history
 * endpoint, so `listTemplates` / `getTemplate` / `listAuditTrailEntries` /
 * `getAuditTrailEntry` are intentionally not implemented — the router returns
 * 501 for them.
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: audit-trail-entry — Zefort has no per-esign audit/event/history API endpoint; the contract audit log is UI-only and not exposed in the REST API.
 * Unavailable: template — Zefort exposes no template resource in its REST API; template management is not available programmatically.
 *
 * Signers and documents are served from the single `GET /esigns/{id}` detail
 * call: Zefort nests both inside the esign object rather than exposing them as
 * standalone collections. That call takes no page or page_size parameter and
 * returns both arrays whole, so both lists are paged locally.
 *
 * Webhooks are CloudEvents-wrapped and authenticated with a static bearer
 * token (not HMAC); see webhook.ts.
 *
 * Docs: https://developers.zefort.com/docs/
 */

import { customForm, pageLocally } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { Document } from '../../schema/document'
import type { WebhookEvent } from '../../schema/webhook'

import {
  buildAuthUrl,
  exchangeCode as zefortExchange,
  refreshCredentials as zefortRefresh,
  normalizeBaseUrl,
} from './auth'
import { ZefortClient } from './client'
import {
  DEFAULT_PAGE_SIZE,
  EU_API_BASE_URL,
  MAX_PAGE_SIZE,
  US_API_BASE_URL,
} from './constants'
import { verifyZefortWebhook, parseZefortWebhookEvents } from './webhook'

import { transformEnvelope, type RawZefortEsign } from './transform/envelope'
import { transformSigner } from './transform/signer'
import { transformDocument } from './transform/document'

const CONNECT_FORM = customForm({
  fields: [
    {
      name: 'apiKey',
      label: 'API key',
      type: 'password',
      required: true,
      helpText:
        'Generate a key under Account settings → API keys in your Zefort account. The key is tied to one user on the account.',
    },
    {
      name: 'host',
      label: 'Zefort instance',
      type: 'text',
      required: false,
      placeholder: 'sandbox.zefort.com',
      helpText:
        'Your Zefort hostname — e.g. sandbox.zefort.com (default), my.zefort.com (EU), us.zefort.com (US), or a dedicated host.',
    },
  ],
  async exchange(input: Record<string, string>): Promise<Credentials> {
    const apiKey = (input?.['apiKey'] ?? '').trim()
    if (!apiKey) throw new Error('API key is required.')
    return {
      accessToken: apiKey,
      extra: { baseUrl: normalizeBaseUrl(input?.['host']) },
    }
  },
})

interface EsignListResponse {
  page?: number
  page_size?: number
  last_page?: number
  count?: number
  next?: string | null
  previous?: string | null
  results?: RawZefortEsign[]
}

export class ZefortAdapter implements DocsignAdapter {
  readonly platform = 'zefort'
  readonly version = '0.1.0'

  // Connect Link support — API key + instance host (Zefort has no OAuth).
  credentialFields = CONNECT_FORM.credentialFields
  exchangeCredentials = CONNECT_FORM.exchangeCredentials

  // Region presets surfaced for documentation/host resolution.
  static readonly EU_BASE_URL = EU_API_BASE_URL
  static readonly US_BASE_URL = US_API_BASE_URL

  getAuthUrl(state: string): string {
    return buildAuthUrl('', '', [], state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return zefortExchange(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return zefortRefresh(credentials)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyZefortWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseZefortWebhookEvents(payload)
  }

  private client(credentials: Credentials): ZefortClient {
    return new ZefortClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      page_size: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    }
    if (typeof params['page'] === 'number') out.page = params['page']
    else if (params['cursor']) out.page = Number(params['cursor'])
    if (params['status']) out.status = String(params['status'])
    return out
  }

  // ── Envelopes (esigns) ───────────────────────────────────────────────────

  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    const res = await this.client(credentials).get<EsignListResponse>(
      '/esigns/',
      this.listParams(params),
    )
    return (res.results ?? []).map(transformEnvelope)
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const raw = await this.client(credentials).get<RawZefortEsign>(`/esigns/${id}/`)
    return transformEnvelope(raw)
  }

  async voidEnvelope(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Envelope> {
    // Zefort cancels an active signing request via POST /esigns/{id}/cancel/.
    await this.client(credentials).post(`/esigns/${id}/cancel/`)
    return this.getEnvelope(credentials, id)
  }

  // ── Signers (parties nested on the esign detail) ──────────────────────────

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Signer[]> {
    // GET /esigns/{id}/ has no paging parameter and returns every party inline.
    const raw = await this.client(credentials).get<RawZefortEsign>(`/esigns/${envelopeId}/`)
    return pageLocally(
      (raw.parties ?? []).map((p) => transformSigner(p, envelopeId)),
      params,
    )
  }

  async getSigner(credentials: Credentials, id: string): Promise<Signer> {
    // Zefort has no party-by-id endpoint; address via "<esignId>:<partyId>".
    const [envelopeId, partyId] = id.includes(':') ? id.split(':') : [id, id]
    if (!envelopeId || !partyId) {
      throw new Error('getSigner expects an id of shape "<esignId>:<partyId>"')
    }
    const all = await this.listSigners(credentials, envelopeId, {})
    const found = all.find((s) => s.externalId === partyId)
    if (!found) throw new Error(`Party ${partyId} not found on esign ${envelopeId}`)
    return found
  }

  // ── Documents (nested on the esign — metadata only, content REFUSED) ──────

  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Document[]> {
    // GET /esigns/{id}/ has no paging parameter and returns every document inline.
    const raw = await this.client(credentials).get<RawZefortEsign>(`/esigns/${envelopeId}/`)
    return pageLocally(
      (raw.documents ?? []).map((d, i) => transformDocument(d, envelopeId, i)),
      params,
    )
  }

  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    // Address via "<esignId>:<documentId>".
    const [envelopeId, documentId] = id.includes(':') ? id.split(':') : [id, id]
    if (!envelopeId || !documentId) {
      throw new Error('getDocument expects an id of shape "<esignId>:<documentId>"')
    }
    const all = await this.listDocuments(credentials, envelopeId, {})
    const found = all.find((d) => d.externalId === documentId)
    if (!found) throw new Error(`Document ${documentId} not found on esign ${envelopeId}`)
    return found
  }
}
