/**
 * Assently E-Sign adapter.
 *
 * Maps Assently `Case` -> canonical `Envelope`, case `parties[]` -> `Signer`,
 * case `documents[]` -> `Document` (metadata only), per-party signing
 * timestamps -> synthesised `AuditTrailEntry`, and reusable template-cases ->
 * `Template`.
 *
 * Auth is OAuth 2.0 Client-Credentials: the customer's API Key + API Secret
 * are Basic-encoded (base64(key:secret)) and POSTed to the token endpoint with
 * grant_type=client_credentials, returning a short-lived bearer token.
 *
 * Assently has no documented webhook-signature verification, so this adapter
 * exposes no `verifyWebhook` / `parseWebhookEvents`.
 *
 * Docs: https://developer.assently.com/docs/getting-started
 */

import { customForm, pageLocally } from '@opensteward/shared'
import type { Credentials, QueryParams, CredentialField } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { Document } from '../../schema/document'
import type { AuditTrailEntry } from '../../schema/audit-trail-entry'
import type { Template } from '../../schema/template'

import { buildAuthUrl, exchangeCode as assentlyExchange, refreshCredentials as assentlyRefresh } from './auth'
import { AssentlyClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, TOKEN_URL } from './constants'

import { transformEnvelope, type RawAssentlyCase } from './transform/envelope'
import { transformSigner, type RawAssentlyParty } from './transform/signer'
import { transformDocument, type RawAssentlyDocument } from './transform/document'
import {
  transformAuditTrailEntry,
  type SyntheticAuditEvent,
} from './transform/audit-trail-entry'
import { transformTemplate } from './transform/template'

export interface AssentlyAdapterConfig {
  clientId?: string
  clientSecret?: string
  redirectUri?: string
}

interface AssentlyTokenResponse {
  access_token: string
  token_type?: string
  expires_in?: number
}

/**
 * Connect Link form: API Key + Secret exchanged for a bearer token via the
 * client-credentials grant using HTTP Basic auth (base64(key:secret)).
 * Matches the scheme used by `refreshCredentials` in auth.ts.
 * The key/secret are persisted on `credentials.extra` so `refreshCredentials`
 * can re-mint the token.
 */
const ASSENTLY_FORM = customForm({
  fields: [
    {
      name: 'clientId',
      label: 'API Key',
      type: 'text',
      helpText: 'Generate an API Key + Secret on your Assently API Settings page.',
      required: true,
    },
    {
      name: 'clientSecret',
      label: 'API Secret',
      type: 'password',
      helpText: 'Shown only once when the API Key is created.',
      required: true,
    },
  ],
  async exchange(fields: Record<string, string>): Promise<Credentials> {
    const apiKey = (fields['clientId'] ?? '').trim()
    const apiSecret = fields['clientSecret'] ?? ''
    if (!apiKey || !apiSecret) throw new Error('API Key and API Secret are required.')
    const basic = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
      },
      body: new URLSearchParams({ grant_type: 'client_credentials' }).toString(),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Assently token endpoint returned ${res.status}: ${text}`)
    }
    const json = (await res.json()) as AssentlyTokenResponse
    return {
      accessToken: json.access_token,
      expiresAt:
        typeof json.expires_in === 'number'
          ? new Date(Date.now() + json.expires_in * 1000)
          : undefined,
      extra: { clientId: apiKey, clientSecret: apiSecret },
    }
  },
})

/** Reply from `POST /api/cases/find`. */
interface FindCasesResponse {
  cases?: RawAssentlyCase[]
}

/** Reply from `POST /api/templates/find`. */
interface FindTemplatesResponse {
  templates?: RawAssentlyCase[]
}

/** Reply from `GET /api/cases/{id}`. */
interface GetCaseResponse {
  caseId?: string
  parties?: RawAssentlyParty[]
  documents?: RawAssentlyDocument[]
  [key: string]: unknown
}

export class AssentlyAdapter implements DocsignAdapter {
  readonly platform = 'assently'
  readonly version = '0.1.0'
  /** Honours `params.search`; see AdapterCapabilities. Declared so the
   *  router can refuse the parameter on adapters that would drop it. */
  readonly capabilities = { search: true }

  // Connect Link -- API Key + Secret -> client-credentials bearer token.
  credentialFields(): CredentialField[] {
    return ASSENTLY_FORM.credentialFields()
  }

  exchangeCredentials = ASSENTLY_FORM.exchangeCredentials

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return assentlyExchange(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return assentlyRefresh(credentials)
  }

  private client(credentials: Credentials): AssentlyClient {
    return new AssentlyClient(credentials)
  }

  /** Build the `findcases` body from canonical query params. */
  private findBody(params: QueryParams): Record<string, unknown> {
    const take = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const page = params.page ?? 1
    const body: Record<string, unknown> = {
      skip: (page - 1) * take,
      take,
    }
    if (params['status']) body.status = String(params['status'])
    if (params.search) body.search = String(params.search)
    if (params['sort']) body.sort = String(params['sort'])
    if (params['templateId']) body.templateId = String(params['templateId'])
    return body
  }

  // ── Envelopes (Cases) ──────────────────────────────────────────────────────

  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    const res = await this.client(credentials).post<FindCasesResponse>(
      '/api/cases/find',
      this.findBody(params),
    )
    return (res.cases ?? []).map(transformEnvelope)
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const raw = await this.client(credentials).get<GetCaseResponse>(`/api/cases/${id}`)
    return transformEnvelope(raw)
  }

  async voidEnvelope(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Envelope> {
    // Assently recalls (withdraws) a sent case via PUT; finished cases can't be recalled.
    await this.client(credentials).put(`/api/cases/${id}/recall`)
    return this.getEnvelope(credentials, id)
  }

  // ── Signers (Parties) ──────────────────────────────────────────────────────

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Signer[]> {
    // GET /api/cases/{caseid} takes only the case id and returns every party,
    // so the caller's page is cut from the whole array here.
    const raw = await this.client(credentials).get<GetCaseResponse>(`/api/cases/${envelopeId}`)
    return pageLocally(
      (raw.parties ?? []).map((p) => transformSigner(p, envelopeId)),
      params,
    )
  }

  async getSigner(credentials: Credentials, id: string): Promise<Signer> {
    const [envelopeId, partyId] = id.split(':')
    if (!envelopeId || !partyId) {
      throw new Error('getSigner expects an id of shape "<caseId>:<partyId>"')
    }
    const all = await this.listSigners(credentials, envelopeId, {})
    const found = all.find((s) => s.externalId === partyId)
    if (!found) throw new Error(`Party ${partyId} not found on case ${envelopeId}`)
    return found
  }

  // ── Documents (metadata only -- content REFUSED) ────────────────────────────

  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Document[]> {
    // The whole `documents[]` array comes in one reply. Page after mapping so
    // the index-derived ids stay stable across pages.
    const raw = await this.client(credentials).get<GetCaseResponse>(`/api/cases/${envelopeId}`)
    return pageLocally(
      (raw.documents ?? []).map((d, i) => transformDocument(d, envelopeId, i)),
      params,
    )
  }

  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    const [envelopeId, documentId] = id.split(':')
    if (!envelopeId || !documentId) {
      throw new Error('getDocument expects an id of shape "<caseId>:<documentId>"')
    }
    const all = await this.listDocuments(credentials, envelopeId, {})
    const found = all.find((d) => d.externalId === documentId)
    if (!found) throw new Error(`Document ${documentId} not found on case ${envelopeId}`)
    return found
  }

  // ── Audit-trail entries -- synthesised from case + party timestamps ─────────

  async listAuditTrailEntries(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    const raw = await this.client(credentials).get<GetCaseResponse & RawAssentlyCase>(
      `/api/cases/${envelopeId}`,
    )
    const events: SyntheticAuditEvent[] = []
    if (raw.createdOn) {
      events.push({ envelopeId, occurredAt: raw.createdOn, type: 'created', description: 'Case created' })
    }
    if (raw.sentOn) {
      events.push({ envelopeId, occurredAt: raw.sentOn, type: 'sent', description: 'Case sent' })
    }
    for (const party of (raw.parties as RawAssentlyParty[] | undefined) ?? []) {
      if (party.signedOn) {
        events.push({
          envelopeId,
          occurredAt: party.signedOn,
          type: 'signed',
          description: 'Party signed',
          actorId: party.id,
          actorEmail: party.emailAddress,
          actorName: party.name,
          actorIp: party.ipAddress,
        })
      }
    }
    if (raw.finishedOn) {
      events.push({
        envelopeId,
        occurredAt: raw.finishedOn,
        type: raw.rejected ? 'declined' : 'completed',
        description: raw.rejected ? 'Case rejected' : 'Case finished',
      })
    }
    events.sort((a, b) => (a.occurredAt ?? '').localeCompare(b.occurredAt ?? ''))
    // Synthesised from one case reply: index the whole list, then page it.
    return pageLocally(
      events.map((e, i) => transformAuditTrailEntry(e, i)),
      params,
    )
  }

  async getAuditTrailEntry(credentials: Credentials, id: string): Promise<AuditTrailEntry> {
    const [envelopeId, indexStr] = id.split(':')
    if (!envelopeId || !indexStr) {
      throw new Error('getAuditTrailEntry expects an id of shape "<caseId>:<index>"')
    }
    const all = await this.listAuditTrailEntries(credentials, envelopeId, {})
    const found = all[Number(indexStr)]
    if (!found) throw new Error(`Audit entry ${id} not found`)
    return found
  }

  // ── Templates (reusable template-cases) ────────────────────────────────────

  async listTemplates(credentials: Credentials, params: QueryParams): Promise<Template[]> {
    const res = await this.client(credentials).post<FindTemplatesResponse>(
      '/api/templates/find',
      this.findBody(params),
    )
    return (res.templates ?? []).map(transformTemplate)
  }

  async getTemplate(credentials: Credentials, id: string): Promise<Template> {
    const raw = await this.client(credentials).get<GetCaseResponse>(`/api/templates/${id}`)
    return transformTemplate(raw)
  }
}
