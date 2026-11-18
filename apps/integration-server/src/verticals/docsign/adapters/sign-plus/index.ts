/**
 * Sign.Plus (Alohi) adapter.
 *
 * Maps Sign.Plus `envelopes` → canonical `Envelope`, the recipients nested in
 * each envelope's `signing_steps[]` → `Signer`, the envelope `documents[]`
 * manifest (filename + page count only — signed-document, certificate, and
 * attachment downloads are content and are refused) → `Document`, and
 * `templates` → `Template`.
 *
 * Auth is a static API key / Personal Access Token sent as a Bearer token (no
 * OAuth); credential entry uses the Connect Link single-API-key form.
 *
 * Resources Sign.Plus does NOT support are intentionally left unimplemented so
 * the router returns 501:
 *   - Audit-trail entries: Sign.Plus has no list/get audit endpoint. Audit
 *     activity is delivered only via the `ENVELOPE_AUDIT_TRAIL` webhook, so
 *     there is no readable audit surface to expose.
 *   - Webhooks: Sign.Plus does not document any signature-verification
 *     mechanism (no signing secret or signature header), so `verifyWebhook`
 *     and `parseWebhookEvents` are omitted rather than implemented insecurely.
 *
 * ── Resource coverage ──────────────────────────────────────────────────────
 * Unavailable: audit-trail-entry — no REST list/get endpoint; audit activity
 *   is push-only via the ENVELOPE_AUDIT_TRAIL webhook event.
 *
 * Docs: https://apidoc.sign.plus/get-started/introduction
 */

import { pageLocally, simpleApiKey } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { Document } from '../../schema/document'
import type { Template } from '../../schema/template'

import {
  buildAuthUrl,
  exchangeCode as signPlusExchange,
  refreshCredentials as signPlusRefresh,
} from './auth'
import { SignPlusClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import {
  transformEnvelope,
  type RawSignPlusEnvelope,
} from './transform/envelope'
import { transformSigner } from './transform/signer'
import { transformDocument, type RawSignPlusDocument } from './transform/document'
import { transformTemplate, type RawSignPlusTemplate } from './transform/template'

const SIMPLE_API_KEY_FORM = simpleApiKey({
  label: 'Sign.Plus API key',
  helpText:
    'Find this on the Integrations page at app.sign.plus/profile/integrations (used as a Bearer token).',
})

interface ListEnvelopesResponse {
  has_next_page?: boolean
  has_previous_page?: boolean
  envelopes?: RawSignPlusEnvelope[]
}

interface ListTemplatesResponse {
  has_next_page?: boolean
  has_previous_page?: boolean
  templates?: RawSignPlusTemplate[]
}

interface ListEnvelopeDocumentsResponse {
  documents?: RawSignPlusDocument[]
}

export class SignPlusAdapter implements DocsignAdapter {
  readonly platform = 'sign-plus'
  readonly version = '0.1.0'
  /** Honours `params.search`; see AdapterCapabilities. Declared so the
   *  router can refuse the parameter on adapters that would drop it. */
  readonly capabilities = { search: true }

  // Connect Link support — single API-key form (Bearer token).
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  getAuthUrl(): string {
    return buildAuthUrl()
  }

  async exchangeCode(): Promise<Credentials> {
    return signPlusExchange()
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return signPlusRefresh(credentials)
  }

  private client(credentials: Credentials): SignPlusClient {
    return new SignPlusClient(credentials)
  }

  /**
   * Build the JSON request body for the cursor-paginated list endpoints.
   * `first` is the page size; `after` is the opaque cursor. `updatedAfter`
   * maps to the `date_from` Unix-second filter.
   */
  private listBody(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      first: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    }
    if (params['after'] != null) out.after = String(params['after'])
    if (params['before'] != null) out.before = String(params['before'])
    if (params.search) out.search = String(params.search)
    if (Array.isArray(params['statuses'])) out.statuses = params['statuses']
    else if (params['status'] != null) out.statuses = [String(params['status'])]
    if (params.updatedAfter instanceof Date) {
      out.date_from = Math.floor(params.updatedAfter.getTime() / 1000)
    }
    return out
  }

  // ── Envelopes ──────────────────────────────────────────────────────────────

  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    const res = await this.client(credentials).post<ListEnvelopesResponse>(
      '/envelopes',
      this.listBody(params),
    )
    return (res.envelopes ?? []).map(transformEnvelope)
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const raw = await this.client(credentials).get<RawSignPlusEnvelope>(`/envelope/${id}`)
    return transformEnvelope(raw)
  }

  async voidEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    // Sign.Plus voids an envelope with PUT /envelope/{id}/void (no body) and
    // returns the updated envelope.
    const raw = await this.client(credentials).put<RawSignPlusEnvelope>(`/envelope/${id}/void`)
    return transformEnvelope(raw)
  }

  // ── Signers (recipients nested in signing_steps) ─────────────────────────────

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Signer[]> {
    // GET /envelope/{envelope_id} takes only the path parameter and carries
    // every recipient in `signing_steps[]`; there is no upstream page, so the
    // flattened collection is paged locally.
    const raw = await this.client(credentials).get<RawSignPlusEnvelope>(`/envelope/${envelopeId}`)
    const out: Signer[] = []
    const steps = raw.signing_steps ?? []
    for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
      for (const recipient of steps[stepIndex]?.recipients ?? []) {
        out.push(transformSigner(recipient, envelopeId, stepIndex, raw.status))
      }
    }
    return pageLocally(out, params)
  }

  async getSigner(credentials: Credentials, id: string): Promise<Signer> {
    // Sign.Plus has no recipient-by-id endpoint; recipients live inside the
    // envelope payload. The id is "<envelopeId>:<recipientId>".
    const [envelopeId, recipientId] = id.split(':')
    if (!envelopeId || !recipientId) {
      throw new Error('Sign.Plus getSigner expects an id of shape "<envelopeId>:<recipientId>"')
    }
    const all = await this.listSigners(credentials, envelopeId, {})
    const found = all.find((s) => s.externalId === recipientId || s.id === recipientId)
    if (!found) throw new Error(`Signer ${recipientId} not found on envelope ${envelopeId}`)
    return found
  }

  // ── Documents (metadata only — downloads REFUSED) ────────────────────────────

  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Document[]> {
    // GET /envelope/{envelope_id}/documents takes only the path parameter and
    // returns the whole manifest; `order` is assigned over the whole manifest
    // before it is paged locally.
    const res = await this.client(credentials).get<ListEnvelopeDocumentsResponse>(
      `/envelope/${envelopeId}/documents`,
    )
    return pageLocally(
      (res.documents ?? []).map((raw, i) => transformDocument(raw, envelopeId, i)),
      params,
    )
  }

  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    // The id is "<envelopeId>:<documentId>" — Sign.Plus exposes a per-document
    // GET, and we resolve the document's order from the envelope's manifest.
    const [envelopeId, documentId] = id.split(':')
    if (!envelopeId || !documentId) {
      throw new Error('Sign.Plus getDocument expects an id of shape "<envelopeId>:<documentId>"')
    }
    const raw = await this.client(credentials).get<RawSignPlusDocument>(
      `/envelope/${envelopeId}/document/${documentId}`,
    )
    const all = await this.listDocuments(credentials, envelopeId, {})
    const order = all.findIndex((d) => d.externalId === documentId)
    return transformDocument(raw, envelopeId, order >= 0 ? order : 0)
  }

  // ── Templates ────────────────────────────────────────────────────────────────

  async listTemplates(credentials: Credentials, params: QueryParams): Promise<Template[]> {
    const res = await this.client(credentials).post<ListTemplatesResponse>(
      '/templates',
      this.listBody(params),
    )
    return (res.templates ?? []).map(transformTemplate)
  }

  async getTemplate(credentials: Credentials, id: string): Promise<Template> {
    const raw = await this.client(credentials).get<RawSignPlusTemplate>(`/template/${id}`)
    return transformTemplate(raw)
  }
}
