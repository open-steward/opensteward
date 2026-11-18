/**
 * A-Trust adapter (Austrian eIDAS QTSP), on the Signaturbox API
 * (https://docs.a-trust.at/swagger/signaturbox.yaml). Static API key sent as
 * `x-api-key`. Only templates are readable; see BATCH_UNREADABLE_REASON.
 */
import { pageLocally } from '@opensteward/shared'
import type { CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { Document } from '../../schema/document'
import type { AuditTrailEntry } from '../../schema/audit-trail-entry'
import type { Template } from '../../schema/template'
import type { WebhookEvent } from '../../schema/webhook'

import {
  credentialFields as aTrustCredentialFields,
  exchangeCredentials as aTrustExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { ATrustClient } from './client'
import { verifyATrustWebhook, parseATrustWebhookEvents } from './webhook'

import { transformTemplate, type RawATrustTemplate } from './transform/template'

export interface ATrustAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

/** `TemplateList` (https://docs.a-trust.at/swagger/signaturbox.yaml). */
interface TemplateListResponse {
  templateList?: RawATrustTemplate[]
}

/**
 * The Signaturbox API documents no way to read a signature batch back. Its
 * quick reference (https://docs.a-trust.at/apis/SignaturServer/overview) lists
 * every call, and the only GETs are `signaturebatches/<ticket>/certificate`
 * ("Get the used certificate"), `templates` and `templates/<id>`. Documents
 * are added by POST and handed back once by DELETE, and "After all documents
 * of a signature Batch are successfully downloaded the session data is
 * deleted." There is no signer, document or audit listing, and no
 * `/v1/dossiers` path anywhere in https://docs.a-trust.at/swagger/signaturbox.yaml.
 */
const BATCH_UNREADABLE_REASON =
  '"the signed documents can be received with an HTTP DELETE call" and "After all documents of a ' +
  'signature Batch are successfully downloaded the session data is deleted"; the API documents no ' +
  'GET for a signature batch (https://docs.a-trust.at/apis/SignaturServer/overview)'

function notSupported(what: 'list' | 'get', resource: string): Error {
  return Object.assign(
    new Error(`A-Trust cannot ${what} ${resource}: ${BATCH_UNREADABLE_REASON}`),
    { statusCode: 501, code: 'NOT_SUPPORTED' },
  )
}

export class ATrustAdapter implements DocsignAdapter {
  readonly platform = 'a-trust'
  readonly version = '0.1.0'

  constructor(_config: ATrustAdapterConfig) {}

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('a-trust uses static API key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  credentialFields(): CredentialField[] {
    return aTrustCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return aTrustExchangeCredentials(fields)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyATrustWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseATrustWebhookEvents(payload)
  }

  private client(credentials: Credentials): ATrustClient {
    return new ATrustClient(credentials)
  }

  // ── Signature batches, signers, documents, audit trail: not readable ────

  async listEnvelopes(_credentials: Credentials, _params: QueryParams): Promise<Envelope[]> {
    throw notSupported('list', 'envelopes')
  }

  async getEnvelope(_credentials: Credentials, _id: string): Promise<Envelope> {
    throw notSupported('get', 'envelopes')
  }

  async voidEnvelope(
    credentials: Credentials,
    id: string,
    data?: { reason?: string },
  ): Promise<Envelope> {
    await this.client(credentials).post(`/dossiers/${id}/cancel`, {
      reason: data?.reason ?? 'Voided by API',
    })
    return this.getEnvelope(credentials, id)
  }

  async listSigners(
    _credentials: Credentials,
    _envelopeId: string,
    _params: QueryParams,
  ): Promise<Signer[]> {
    throw notSupported('list', 'signers')
  }

  async getSigner(_credentials: Credentials, _id: string): Promise<Signer> {
    throw notSupported('get', 'signers')
  }

  async listDocuments(
    _credentials: Credentials,
    _envelopeId: string,
    _params: QueryParams,
  ): Promise<Document[]> {
    throw notSupported('list', 'documents')
  }

  async getDocument(_credentials: Credentials, _id: string): Promise<Document> {
    throw notSupported('get', 'documents')
  }

  async listAuditTrailEntries(
    _credentials: Credentials,
    _envelopeId: string,
    _params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    throw notSupported('list', 'audit trail entries')
  }

  async getAuditTrailEntry(_credentials: Credentials, _id: string): Promise<AuditTrailEntry> {
    throw notSupported('get', 'audit trail entries')
  }

  // ── Templates ─────────────────────────────────────────────────────────────

  /**
   * `GET /v2/templates` — "The call gets a list of all available templates for
   * the API Key." (https://docs.a-trust.at/apis/SignaturServer/templates). The
   * operation takes no parameters and returns every template as
   * `{ templateList: TemplateSummary[] }`
   * (https://docs.a-trust.at/swagger/signaturbox.yaml), so it is paged locally.
   */
  private async fetchAllTemplates(credentials: Credentials): Promise<Template[]> {
    const res = await this.client(credentials).get<TemplateListResponse>('/v2/templates')
    // The documented response always carries `templateList`; a 200 without it
    // (XML, an HTML error page, a changed shape) must not read as zero templates.
    if (!Array.isArray(res?.templateList)) {
      throw new Error('A-Trust GET /v2/templates returned no templateList array')
    }
    return res.templateList.map(transformTemplate)
  }

  async listTemplates(credentials: Credentials, params: QueryParams): Promise<Template[]> {
    return pageLocally(await this.fetchAllTemplates(credentials), params)
  }

  /**
   * `GET /v2/templates/{id}` answers with the template's XML
   * (`<SignatureTemplateStyle>...</SignatureTemplateStyle>`), which carries no
   * TemplateSummary fields; the summary a list returned is read back from the
   * same documented list call instead.
   */
  async getTemplate(credentials: Credentials, id: string): Promise<Template> {
    const found = (await this.fetchAllTemplates(credentials)).find((t) => t.externalId === id)
    if (!found) {
      throw Object.assign(new Error(`A-Trust template ${id} not found`), {
        statusCode: 404,
        code: 'NOT_FOUND',
      })
    }
    return found
  }
}
