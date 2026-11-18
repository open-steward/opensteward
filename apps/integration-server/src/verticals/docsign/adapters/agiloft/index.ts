/**
 * Agiloft adapter — Contract Lifecycle Management → canonical docsign schema.
 *
 * Agiloft is a configurable, table-based CLM platform reached over its
 * per-tenant REST interface (`https://{host}/ewws/{operation}?$KB=…`).
 * The canonical mapping:
 *   - Envelope ← Contracts table record (EWSearch to list, EWRead to read)
 *
 * Documents and audit-trail entries are refused (501 NOT_SUPPORTED) before
 * any request; the reasons are quoted below. Signer and Template have no
 * standard REST resource in a generic Agiloft KB, so those methods are
 * intentionally omitted — the router auto-returns 501 for them.
 *
 * Auth is OAuth2 Authorization-Code Grant. Agiloft has no documented
 * HMAC-signed outbound webhook over the REST interface (notifications are
 * driven by internal rules / email), so this adapter exposes no webhook
 * verification or event parsing.
 */

// ── Resource coverage ──────────────────────────────────────────────────────────
// Unavailable: signer   — Agiloft CLM embeds signer info as fields within the
//                         Contracts table record; no dedicated signer table or
//                         REST resource exists in a generic Agiloft KB.
// Unverified:  template — Agiloft has a Document Templates table (Word/PDF
//                         generation templates), but REST docs are behind
//                         authentication. Even if reachable, these are document-
//                         generation templates, not signing workflow templates,
//                         and lack the signerRoles / documentCount fields the
//                         canonical Template schema requires.
// Refused:     document, audit-trail-entry — see DOCUMENTS_UNSUPPORTED and
//                         AUDIT_UNSUPPORTED below.
// ──────────────────────────────────────────────────────────────────────────────

import { pageOffset, reportUpstreamPage } from '@opensteward/shared'
import type { CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Document } from '../../schema/document'
import type { AuditTrailEntry } from '../../schema/audit-trail-entry'

import {
  buildAuthUrl,
  exchangeCode as agiloftExchange,
  refreshCredentials as agiloftRefresh,
} from './auth'
import { AgiloftClient } from './client'
import {
  CONTRACT_TITLE_FIELD,
  CONTRACTS_TABLE,
  DEFAULT_PAGE_SIZE,
  DEFAULT_SCOPES,
} from './constants'

import { transformEnvelope, type RawAgiloftContract } from './transform/envelope'

/**
 * Contract attachments are records of a separate Attachments table, linked
 * from the contract as a related table ("Contract Attachments | Related Table:
 * Attachments", Contracts Table, SD docs). Listing them means a Search on that
 * table, whose logical name the public docs never give ("$table … Uses logical
 * table name", REST - Search); the only per-record operation, EWAttachInfo,
 * "returns information about the attachments of a record in a particular
 * field", which the contract record does not hold. The old call — GET
 * /ewws/REST/{kb}/all_contract_attachments?query=… — is not an operation the
 * REST Interface defines.
 */
const DOCUMENTS_UNSUPPORTED =
  'contract files are records of the Attachments table, whose logical table name the public ' +
  'REST docs do not give, and EWAttachInfo only "returns information about the attachments of ' +
  'a record in a particular field" (https://help.agiloft.com/space/HELP/43715898)'

/**
 * History is not a table the REST interface exposes: "The History field is a
 * special embedded table data type" (History Fields,
 * https://help.agiloft.com/space/HELP/43716066), and no operation in the REST
 * Interface table reads it. The old call — GET /ewws/REST/{kb}/contract/{id}/
 * history — is not in the documented convention "/ewws/REST/{kbName}/{table}[/{id}]".
 */
const AUDIT_UNSUPPORTED =
  'record history is "a special embedded table data type" ' +
  '(https://help.agiloft.com/space/HELP/43716066) and no REST operation reads it ' +
  '(https://help.agiloft.com/space/HELP/43715778)'

function notSupported(what: string, reason: string): Error {
  return Object.assign(new Error(`Agiloft cannot ${what}: ${reason}`), {
    statusCode: 501,
    code: 'NOT_SUPPORTED',
  })
}

export interface AgiloftAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  /**
   * Deployment-wide Agiloft server, e.g. `acme.agiloft.com`. Optional: the
   * server is normally the customer's, collected at connect time
   * (`oauthFields`) and read back from `credentials.extra.host`.
   */
  host?: string
  /** Deployment-wide knowledge-base name; normally collected per connection like `host`. */
  kb?: string
  scopes?: string[]
}

export class AgiloftAdapter implements DocsignAdapter {
  readonly platform = 'agiloft'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private host: string | undefined
  private kb: string | undefined
  private scopes: string[]

  constructor(config: AgiloftAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.host = config.host
    this.kb = config.kb
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  /**
   * Agiloft's OAuth endpoints and REST interface are on the customer's own
   * server, and every REST path names their knowledge base — neither is
   * something deployment config can know. Asked for before the redirect.
   */
  oauthFields(): CredentialField[] {
    return [
      {
        name: 'host',
        label: 'Agiloft server',
        type: 'text',
        required: true,
        placeholder: 'acme.agiloft.com',
        helpText: 'The host name you sign in to Agiloft at. It must be reachable over https.',
      },
      {
        name: 'kb',
        label: 'Knowledge base (KB)',
        type: 'text',
        required: true,
        placeholder: 'Demo',
        helpText: 'The name of the Agiloft knowledge base to connect (case-sensitive).',
      },
    ]
  }

  getAuthUrl(
    state: string,
    overrideScopes?: string[],
    _codeChallenge?: string,
    inputs?: Record<string, string>,
  ): string {
    return buildAuthUrl(
      inputs?.['host'] ?? this.host,
      inputs?.['kb'] ?? this.kb,
      this.clientId,
      this.redirectUri,
      overrideScopes ?? this.scopes,
      state,
    )
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return agiloftExchange(this.host, this.kb, code, redirectUri, this.clientId, this.clientSecret)
  }

  /** Exchange on the customer's server and remember server + KB with the credentials. */
  async exchangeCodeWithInputs(
    code: string,
    redirectUri: string,
    inputs: Record<string, string>,
  ): Promise<Credentials> {
    return agiloftExchange(
      inputs['host'] ?? this.host,
      inputs['kb'] ?? this.kb,
      code,
      redirectUri,
      this.clientId,
      this.clientSecret,
    )
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return agiloftRefresh(this.host, this.kb, credentials, this.clientId, this.clientSecret)
  }

  private client(credentials: Credentials): AgiloftClient {
    return new AgiloftClient(credentials, this.host, this.kb)
  }

  // ── Envelopes (Contracts) ─────────────────────────────────────────────────

  /**
   * One caller page of contracts through EWSearch, the REST interface's list
   * operation (REST - Search, https://help.agiloft.com/space/HELP/43717730):
   * "This operation allows retrieval of results page by page (pagination)
   * using "page" and "limit" parameters." and "Page numbers start with 0
   * (zero)." — so upstream page = caller page − 1, at the caller's limit.
   * No maximum is documented, so the limit is sent as is (never 0, which
   * means "all records"). The reply carries no total; a short page is the
   * end ("If pagination is being used, the number of records is in the
   * context of the current page and the specified page size").
   *
   * No `search`/`query` is sent: the prose makes both optional ("the label of
   * the saved search or an ad hoc query may be included in the call"), even
   * though the parameter table marks `query` Required. That same table marks
   * `login` and `password` Required, which a Bearer call leaves out.
   * No sort parameter is documented, and "The REST interface creates a new
   * session and performs an explicit logout for each call. As such, though
   * pagination is available, the query will always be rebuilt and rerun." So
   * pages are not stable against concurrent edits: "the logical page
   * boundaries might shift when iterating the query page by page".
   *
   * A `success:true` reply with no `result` is an empty page: "When a page is
   * not found, an empty result is returned."
   */
  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    const asked = Math.floor(Number(params.limit ?? DEFAULT_PAGE_SIZE))
    const limit = asked >= 1 ? asked : DEFAULT_PAGE_SIZE
    const page = pageOffset(params, limit) / limit
    const rows = await this.client(credentials).call<RawAgiloftContract[]>(
      'EWSearch',
      CONTRACTS_TABLE,
      { field: ['id', CONTRACT_TITLE_FIELD], page, limit },
      [],
    )
    reportUpstreamPage(params, { hasMore: rows.length >= limit })
    return rows.map(transformEnvelope)
  }

  /**
   * EWRead with the JSON decorator: "https://<hostname>/ewws/EWRead/.json?
   * $KB=KB&$table=<table>&…&id=<id>" → {"success":true,"message":"","result":
   * {…,"id":21}} (REST Interface, https://help.agiloft.com/space/HELP/43715778).
   */
  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const raw = await this.client(credentials).call<RawAgiloftContract>('EWRead', CONTRACTS_TABLE, {
      id,
    })
    return transformEnvelope(raw)
  }

  // ── Documents (refused — see DOCUMENTS_UNSUPPORTED) ────────────────────────

  async listDocuments(
    _credentials: Credentials,
    _envelopeId: string,
    _params: QueryParams,
  ): Promise<Document[]> {
    throw notSupported('list documents', DOCUMENTS_UNSUPPORTED)
  }

  async getDocument(_credentials: Credentials, _id: string): Promise<Document> {
    throw notSupported('get documents', DOCUMENTS_UNSUPPORTED)
  }

  // ── Audit-trail entries (refused — see AUDIT_UNSUPPORTED) ──────────────────

  async listAuditTrailEntries(
    _credentials: Credentials,
    _envelopeId: string,
    _params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    throw notSupported('list audit trail entries', AUDIT_UNSUPPORTED)
  }

  async getAuditTrailEntry(_credentials: Credentials, _id: string): Promise<AuditTrailEntry> {
    throw notSupported('get audit trail entries', AUDIT_UNSUPPORTED)
  }
}
