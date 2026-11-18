/**
 * Odoo Sign adapter, on the shared Odoo client (@opensteward/shared
 * adapter/odoo): JSON-2 on Odoo 19+, External RPC (/jsonrpc execute_kw) on
 * 14–18, as the connection chooses.
 *
 * Docs: https://www.odoo.com/documentation/19.0/developer/reference/external_api.html
 *   "Post a JSON object at the /json/2/<model>/<method> URL."
 *   "Access to data via the external API is only available on Custom Odoo
 *    pricing plans."
 * Sign is an Enterprise app: https://www.odoo.com/page/editions marks it
 * absent from Community and present in Enterprise.
 *
 * Sign's source is not public (github.com/odoo/enterprise is private), so no
 * model or field here is read from code. Each is one Odoo's own published data
 * writes on the model (github.com/odoo/industry, 18.0 / 19.0 / master) or an
 * automatic ORM field; the transforms quote where. The shared client asks
 * fields_get before every read and drops a field the server lacks.
 *
 *   - Envelopes   sign.request
 *   - Signers     sign.request.item, via the request's request_item_ids
 *   - Templates   sign.template; roles from sign.item responsible_id
 *   - Documents   the request's template files: sign.document on 19.0+,
 *                 sign.template.attachment_id on 18.0; metadata from
 *                 ir.attachment (never its content)
 * Audit trail and voiding are refused (501): no model or method for either is
 * published.
 *
 * Lists of envelopes and templates are one `search_read` page: "offset and
 * limit parameters are available to only retrieve a subset of all matched
 * records" (19.0 external_rpc_api, Pagination), in id order, with
 * search_count for the total; `updated_after` is a `write_date >=` criterion. Signers and documents of one envelope are read
 * whole (a request's item ids, a template's files) and paged locally.
 */
import {
  ODOO_CREDENTIAL_FORM,
  OdooClient,
  odooDatetime,
  pageLocally,
  pageOffset,
  reportUpstreamPage,
  type Credentials,
  type OdooDomain,
  type QueryParams,
} from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { Document } from '../../schema/document'
import type { AuditTrailEntry } from '../../schema/audit-trail-entry'
import type { Template } from '../../schema/template'

import { DEFAULT_LIMIT } from './constants'
import { metadata } from './metadata'
import { idList, many2oneName, type Many2one } from './values'
import {
  SIGN_REQUEST_FIELDS,
  transformEnvelope,
  type RawOdooSignRequest,
} from './transform/envelope'
import {
  SIGN_REQUEST_ITEM_FIELDS,
  transformSigner,
  type RawOdooSignRequestItem,
} from './transform/signer'
import {
  SIGN_TEMPLATE_FIELDS,
  transformTemplate,
  type RawOdooSignTemplate,
} from './transform/template'
import {
  ATTACHMENT_FIELDS,
  SIGN_DOCUMENT_FIELDS,
  documentId,
  transformDocument,
  type OdooSignFile,
  type RawOdooAttachment,
} from './transform/document'

export interface OdooSignAdapterConfig {
  /** Unused: the Odoo URL is per connection, in `credentials.extra.baseUrl` (the shared Odoo form). */
  instanceUrl?: string
}

/**
 * How sign files hang together on this server. Odoo 19.0's data points
 * sign.item at a sign.document (`document_id`); 18.0's points it at the
 * template (`template_id`) and the template carries its one `attachment_id`.
 */
interface Layout {
  files: 'sign.document' | 'template-attachment'
  itemLink?: 'document_id' | 'template_id'
}

interface RawSignDocument {
  id: number
  template_id?: Many2one
  attachment_id?: Many2one
}

interface RawSignItem {
  id: number
  document_id?: Many2one
  template_id?: Many2one
  responsible_id?: Many2one
}

function notFound(what: string, id: string): Error {
  return Object.assign(new Error(`Odoo: ${what} ${id} not found`), {
    statusCode: 404,
    code: 'NOT_FOUND',
  })
}

const LABEL: Record<(typeof metadata.unavailableResources)[number]['resource'], string> = {
  'audit-trail-entry': 'audit trail entries',
}

function notSupported(resource: (typeof metadata.unavailableResources)[number]['resource']): Error {
  const reason = metadata.unavailableResources.find((r) => r.resource === resource)!.reason
  return Object.assign(new Error(`odoo-sign cannot read ${LABEL[resource]}: ${reason}`), {
    statusCode: 501,
    code: 'NOT_SUPPORTED',
  })
}

/** Odoo record ids are integers; anything else names no record. */
function recordId(what: string, id: string): number {
  if (!/^[1-9]\d*$/.test(id)) throw notFound(what, id)
  const n = Number(id)
  if (!Number.isSafeInteger(n)) throw notFound(what, id)
  return n
}

/**
 * The caller's `updated_after` as a `write_date` criterion. `write_date` is the
 * automatic "Last Updated on" field (19.0 ORM reference, Automatic fields),
 * `>=` is "greater than or equal to" (same page, Search domains), and the
 * value is Odoo's UTC "YYYY-MM-DD HH:MM:SS" (odooDatetime).
 */
function updatedDomain(params: QueryParams): OdooDomain {
  return params.updatedAfter instanceof Date
    ? [['write_date', '>=', odooDatetime(params.updatedAfter)]]
    : []
}

function pageLimit(params: QueryParams): number {
  const limit = params.limit ?? DEFAULT_LIMIT
  if (typeof limit !== 'number' || !Number.isFinite(limit) || limit < 1) {
    throw Object.assign(new Error(`Odoo: limit must be a number ≥ 1 (got ${String(limit)})`), {
      statusCode: 400,
      code: 'VALIDATION',
    })
  }
  return Math.floor(limit)
}

function m2oNumber(v: Many2one | undefined): number | undefined {
  return Array.isArray(v) && typeof v[0] === 'number' ? v[0] : undefined
}

function unique(ids: (number | undefined)[]): number[] {
  return [...new Set(ids.filter((x): x is number => x !== undefined))].sort((a, b) => a - b)
}

export class OdooSignAdapter implements DocsignAdapter {
  credentialFields = ODOO_CREDENTIAL_FORM.credentialFields
  exchangeCredentials = ODOO_CREDENTIAL_FORM.exchangeCredentials

  readonly platform = 'odoo-sign'
  readonly version = '0.1.0'

  constructor(_config: OdooSignAdapterConfig = {}) {}

  getAuthUrl(_state: string, _scopes?: string[]): string {
    // Odoo authenticates with an API key; there is no OAuth2 redirect.
    return '#api-key-auth'
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('OdooSignAdapter: OAuth2 not supported. Use API key auth.')
  }

  /** An API key is sent as is on every call; there is nothing to refresh. */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private client(credentials: Credentials): OdooClient {
    return new OdooClient(credentials)
  }

  /** One record by id with `read`, or a 404. */
  private async one<T>(
    client: OdooClient,
    what: string,
    model: string,
    id: string,
    fields: string[],
  ): Promise<T> {
    const rows = await client.read<T>(model, [recordId(what, id)], fields)
    const row = rows[0]
    if (!row) throw notFound(what, id)
    return row
  }

  private async layout(client: OdooClient): Promise<Layout> {
    const have = await client.fieldsOf('sign.item', ['document_id', 'template_id'])
    if (have.includes('document_id')) return { files: 'sign.document', itemLink: 'document_id' }
    return {
      files: 'template-attachment',
      ...(have.includes('template_id') ? { itemLink: 'template_id' as const } : {}),
    }
  }

  /** Each template's files, in id order. */
  private async filesOf(
    client: OdooClient,
    layout: Layout,
    templateIds: number[],
  ): Promise<Map<number, OdooSignFile[]>> {
    const out = new Map<number, OdooSignFile[]>()
    if (templateIds.length === 0) return out
    const add = (tid: number | undefined, file: OdooSignFile) => {
      if (tid === undefined) return
      const list = out.get(tid) ?? []
      list.push(file)
      out.set(tid, list)
    }
    if (layout.files === 'sign.document') {
      const rows = await client.searchRead<RawSignDocument>('sign.document', {
        domain: [['template_id', 'in', templateIds]],
        fields: SIGN_DOCUMENT_FIELDS,
        order: 'id asc',
      })
      for (const r of rows) {
        const attachmentId = m2oNumber(r.attachment_id)
        const attachmentName = many2oneName(r.attachment_id)
        add(m2oNumber(r.template_id), {
          model: 'sign.document',
          id: r.id,
          ...(attachmentId !== undefined ? { attachmentId } : {}),
          ...(attachmentName ? { attachmentName } : {}),
        })
      }
      return out
    }
    const rows = await client.read<RawOdooSignTemplate>('sign.template', templateIds, [
      'id',
      'attachment_id',
    ])
    for (const r of rows) {
      const attachmentId = m2oNumber(r.attachment_id)
      if (attachmentId === undefined) continue
      const attachmentName = many2oneName(r.attachment_id)
      add(r.id, {
        model: 'ir.attachment',
        id: attachmentId,
        attachmentId,
        ...(attachmentName ? { attachmentName } : {}),
      })
    }
    return out
  }

  /** Each template's distinct signer-role names, from its sign.item responsible_id, in item order. */
  private async rolesOf(
    client: OdooClient,
    layout: Layout,
    templateIds: number[],
    files: Map<number, OdooSignFile[]>,
  ): Promise<Map<number, string[]>> {
    const out = new Map<number, string[]>()
    if (templateIds.length === 0 || !layout.itemLink) return out
    let domain: OdooDomain
    const templateOf = new Map<number, number>()
    if (layout.itemLink === 'document_id') {
      for (const [tid, list] of files) for (const f of list) templateOf.set(f.id, tid)
      if (templateOf.size === 0) return out
      domain = [['document_id', 'in', [...templateOf.keys()].sort((a, b) => a - b)]]
    } else {
      domain = [['template_id', 'in', templateIds]]
    }
    const items = await client.searchRead<RawSignItem>('sign.item', {
      domain,
      fields: ['id', layout.itemLink, 'responsible_id'],
      order: 'id asc',
    })
    for (const item of items) {
      const link = m2oNumber(
        layout.itemLink === 'document_id' ? item.document_id : item.template_id,
      )
      const tid = layout.itemLink === 'document_id' ? templateOf.get(link ?? -1) : link
      const role = many2oneName(item.responsible_id)
      if (tid === undefined || !role) continue
      const list = out.get(tid) ?? []
      if (!list.includes(role)) list.push(role)
      out.set(tid, list)
    }
    return out
  }

  private async envelopesWithFiles(
    client: OdooClient,
    rows: RawOdooSignRequest[],
  ): Promise<Envelope[]> {
    const templateIds = unique(rows.map((r) => m2oNumber(r.template_id)))
    const files = templateIds.length
      ? await this.filesOf(client, await this.layout(client), templateIds)
      : new Map<number, OdooSignFile[]>()
    return rows.map((r) => {
      const envelopeId = String(r.id)
      const tid = m2oNumber(r.template_id)
      const own = tid === undefined ? [] : (files.get(tid) ?? [])
      return transformEnvelope(
        r,
        own.map((f) => documentId(envelopeId, f)),
      )
    })
  }

  private async templatesWithParts(
    client: OdooClient,
    rows: RawOdooSignTemplate[],
  ): Promise<Template[]> {
    const ids = rows.map((r) => r.id)
    const layout = await this.layout(client)
    const files = await this.filesOf(client, layout, ids)
    const roles = await this.rolesOf(client, layout, ids, files)
    return rows.map((r) =>
      transformTemplate(r, {
        signerRoles: roles.get(r.id) ?? [],
        documentCount: (files.get(r.id) ?? []).length,
      }),
    )
  }

  /** Every file of an envelope's template, as canonical documents in file order. */
  private async documentsOf(
    client: OdooClient,
    envelopeId: string,
    params?: QueryParams,
  ): Promise<Document[]> {
    const req = await this.one<RawOdooSignRequest>(client, 'envelope', 'sign.request', envelopeId, [
      'id',
      'template_id',
    ])
    const tid = m2oNumber(req.template_id)
    const all =
      tid === undefined
        ? []
        : ((await this.filesOf(client, await this.layout(client), [tid])).get(tid) ?? [])
    const indexed = all.map((file, order) => ({ file, order }))
    const page = params ? pageLocally(indexed, params) : indexed
    const attachmentIds = unique(page.map((p) => p.file.attachmentId))
    const attachments = attachmentIds.length
      ? await client.read<RawOdooAttachment>('ir.attachment', attachmentIds, ATTACHMENT_FIELDS)
      : []
    const byId = new Map(attachments.map((a) => [a.id, a]))
    return page.map(({ file, order }) =>
      transformDocument(
        file,
        file.attachmentId !== undefined ? byId.get(file.attachmentId) : undefined,
        String(req.id),
        order,
      ),
    )
  }

  // ── Envelopes (sign.request) ─────────────────────────────────────────────

  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    const limit = pageLimit(params)
    const offset = pageOffset(params, limit)
    const client = this.client(credentials)
    const page = await client.searchPage<RawOdooSignRequest>('sign.request', {
      domain: updatedDomain(params),
      fields: SIGN_REQUEST_FIELDS,
      offset,
      limit,
    })
    reportUpstreamPage(params, {
      hasMore: page.hasMore,
      ...(page.totalCount !== undefined ? { totalCount: page.totalCount } : {}),
    })
    return this.envelopesWithFiles(client, page.rows)
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const client = this.client(credentials)
    const row = await this.one<RawOdooSignRequest>(
      client,
      'envelope',
      'sign.request',
      id,
      SIGN_REQUEST_FIELDS,
    )
    const [envelope] = await this.envelopesWithFiles(client, [row])
    return envelope!
  }

  /**
   * Refused: no cancel or void method on sign.request is published — the Sign
   * source is private and Odoo's published Sign data calls only
   * `send_signature_accesses` (industry climbing_gym, 19.0).
   */
  async voidEnvelope(
    _credentials: Credentials,
    _id: string,
    _data?: { reason?: string },
  ): Promise<Envelope> {
    throw Object.assign(
      new Error(
        'odoo-sign cannot void envelopes: Odoo publishes no cancel or void method for sign.request (Sign is Enterprise-only and its source is not public), and this adapter is read-only.',
      ),
      { statusCode: 501, code: 'NOT_SUPPORTED' },
    )
  }

  // ── Signers (sign.request.item) ──────────────────────────────────────────

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Signer[]> {
    const client = this.client(credentials)
    const req = await this.one<RawOdooSignRequest>(client, 'envelope', 'sign.request', envelopeId, [
      'id',
      'request_item_ids',
    ])
    const ids = pageLocally(idList(req.request_item_ids), params)
    if (ids.length === 0) return []
    const rows = await client.read<RawOdooSignRequestItem>(
      'sign.request.item',
      ids,
      SIGN_REQUEST_ITEM_FIELDS,
    )
    return rows.sort((a, b) => a.id - b.id).map((r) => transformSigner(r, String(req.id)))
  }

  async getSigner(credentials: Credentials, id: string): Promise<Signer> {
    const client = this.client(credentials)
    const row = await this.one<RawOdooSignRequestItem>(
      client,
      'signer',
      'sign.request.item',
      id,
      SIGN_REQUEST_ITEM_FIELDS,
    )
    // "in: is equal to any of the items from value" (19.0 ORM reference,
    // Search domains) — the request whose request_item_ids holds this item.
    const [parent] = await client.searchRead<{ id: number }>('sign.request', {
      domain: [['request_item_ids', 'in', [row.id]]],
      fields: ['id'],
      limit: 1,
    })
    if (!parent) throw notFound('signer', id)
    return transformSigner(row, String(parent.id))
  }

  // ── Documents (the request's template files; metadata only) ──────────────

  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Document[]> {
    return this.documentsOf(this.client(credentials), envelopeId, params)
  }

  /** `<envelopeId>:<file id>`, the id listDocuments returns. */
  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    const m = /^([1-9]\d*):([1-9]\d*)$/.exec(id)
    if (!m) throw notFound('document', id)
    const docs = await this.documentsOf(this.client(credentials), m[1]!)
    const found = docs.find((d) => d.externalId === m[2])
    if (!found) throw notFound('document', id)
    return found
  }

  // ── Templates (sign.template) ────────────────────────────────────────────

  async listTemplates(credentials: Credentials, params: QueryParams): Promise<Template[]> {
    const limit = pageLimit(params)
    const offset = pageOffset(params, limit)
    const client = this.client(credentials)
    const page = await client.searchPage<RawOdooSignTemplate>('sign.template', {
      domain: updatedDomain(params),
      fields: SIGN_TEMPLATE_FIELDS,
      offset,
      limit,
    })
    reportUpstreamPage(params, {
      hasMore: page.hasMore,
      ...(page.totalCount !== undefined ? { totalCount: page.totalCount } : {}),
    })
    return this.templatesWithParts(client, page.rows)
  }

  async getTemplate(credentials: Credentials, id: string): Promise<Template> {
    const client = this.client(credentials)
    const row = await this.one<RawOdooSignTemplate>(
      client,
      'template',
      'sign.template',
      id,
      SIGN_TEMPLATE_FIELDS,
    )
    const [template] = await this.templatesWithParts(client, [row])
    return template!
  }

  // ── Refused: no published model ──────────────────────────────────────────

  async listAuditTrailEntries(
    _credentials: Credentials,
    _envelopeId: string,
    _params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    throw notSupported('audit-trail-entry')
  }

  async getAuditTrailEntry(_credentials: Credentials, _id: string): Promise<AuditTrailEntry> {
    throw notSupported('audit-trail-entry')
  }
}
