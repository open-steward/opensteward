import { connectionScope, cursorPagerKey, pageByRows, simpleApiKey } from '@opensteward/shared'
/**
 * Barantum CRM adapter for the CRM vertical.
 *
 * Website: https://www.barantum.com
 * Docs: https://docs.barantum.com/api/collections/23513668/2sBYAuTBr5
 *   (Postman collection, "Barantum CRM" folder)
 *
 * ── Auth ─────────────────────────────────────────────────────────────────
 *   "Authentication is done by passing a JWT token in the token field of each
 *   request body." The JWT is what POST https://rest-api.barantum.com/api/login
 *   returns for the CRM account's email and password ("copy the token from the
 *   result"). credentials.accessToken = that JWT.
 *
 * ── Reads ────────────────────────────────────────────────────────────────
 *   Every read is POST https://rest-api.barantum.com/api/get_list_data with a
 *   `module` in the body: Contacts, Org (companies), Deals, Notes, and Calls,
 *   Meetings and Tasks (activities). It pages by `page` alone at a fixed 20
 *   rows, so lists cut the caller's pages out of it with pageByRows and end on
 *   the documented `result.page_last`. A get is the same call with the
 *   module's documented `<module>_uuid` filter.
 *
 *   Pipelines: refused. No module, and no other documented endpoint, lists
 *   pipelines or stages.
 *
 * ── Writes ───────────────────────────────────────────────────────────────
 *   The create* methods still POST to https://app.barantum.com/api/v1/<resource>
 *   with a Bearer header, a host and paths no Barantum doc describes (the host
 *   does not resolve). They were not rebuilt, but they share the transforms:
 *   createContact/Company/Deal/Note parse their response with the documented
 *   get_list_data row transforms (which require `<module>_uuid`), and
 *   untransformDeal no longer divides by 100. The documented write is
 *   POST /api/save_data with `module` and `data` in the body.
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'
import type { WebhookEvent } from '../../schema/webhook'

import { BarantumLegacyWriteClient, getListData, type BarantumModule } from './client'
import { UPSTREAM_PAGE_SIZE } from './constants'
import {
  verifyWebhook as _verifyWebhook,
  parseWebhookEvents as _parseWebhookEvents,
} from './webhook'
import { transformContact, untransformContact, type RawBarantumContact } from './transform/contact'
import { transformCompany, untransformCompany, type RawBarantumCompany } from './transform/company'
import { transformDeal, untransformDeal, type RawBarantumDeal } from './transform/deal'
import {
  ACTIVITY_MODULES,
  parseActivityId,
  transformActivityRow,
  transformLegacyActivity,
  untransformActivity,
  type RawBarantumLegacyActivity,
} from './transform/activity'
import { transformNote, untransformNote, type RawBarantumNote } from './transform/note'

const SIMPLE_API_KEY_FORM = simpleApiKey()

/** The pager scope's account: the one host every Barantum CRM read goes to. */
const ACCOUNT = 'rest-api.barantum.com'

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

function notFound(module: BarantumModule, id: string): Error {
  return Object.assign(new Error(`Barantum ${module} has no record ${id}`), { statusCode: 404 })
}

const NO_PIPELINES =
  'the CRM API\'s get_list_data serves only its "9 core CRM modules: Leads, Contacts, Deals, Tickets, Meetings, Calls, Org, Notes, and Tasks", and no documented endpoint returns pipelines or stages'

/** A position in the activity stream: module index in ACTIVITY_MODULES, then its page. */
function activityCursor(moduleIndex: number, page: number): string {
  return `${moduleIndex}:${page}`
}

export class BarantumAdapter implements CrmAdapter {
  // Connect Link support — single token form (the JWT from /api/login).

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'barantum'
  readonly version = '0.1.0'

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    // Barantum authenticates with a JWT in the request body, not OAuth2.
    return ''
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return { accessToken: code }
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return _verifyWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return _parseWebhookEvents(payload)
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private writeClient(credentials: Credentials): BarantumLegacyWriteClient {
    return new BarantumLegacyWriteClient(credentials)
  }

  private pagerKey(credentials: Credentials, collection: string): string {
    return cursorPagerKey(connectionScope(ACCOUNT, credentials), collection, {
      upstreamLimit: UPSTREAM_PAGE_SIZE,
    })
  }

  /** The caller's page of one module, cut from its fixed 20-row upstream pages. */
  private async listModule<R>(
    credentials: Credentials,
    params: QueryParams,
    module: BarantumModule,
    transform: (raw: Record<string, unknown>) => R,
  ): Promise<R[]> {
    const { items } = await pageByRows<R, number>(
      this.pagerKey(credentials, `get_list_data/${module}`),
      params,
      async (cursor) => {
        const page = cursor ?? 1
        const { content, pageLast } = await getListData<Record<string, unknown>>(
          credentials,
          module,
          { page },
        )
        return { items: content.map(transform), next: page < pageLast ? page + 1 : undefined }
      },
    )
    return items
  }

  /** One record, by the module's documented `<module>_uuid` filter. */
  private async getOne(
    credentials: Credentials,
    module: BarantumModule,
    uuidField: string,
    id: string,
  ): Promise<Record<string, unknown>> {
    const { content } = await getListData<Record<string, unknown>>(credentials, module, {
      [uuidField]: id,
    })
    const row = content.find((r) => r[uuidField] === id)
    if (!row) throw notFound(module, id)
    return row
  }

  // ── Contacts ──────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    return this.listModule(credentials, params, 'Contacts', (r) =>
      transformContact(r as RawBarantumContact),
    )
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const row = await this.getOne(credentials, 'Contacts', 'contacts_uuid', id)
    return transformContact(row as RawBarantumContact)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    const res = await this.writeClient(credentials).post<
      { data: RawBarantumContact } | RawBarantumContact
    >('/contacts', body)
    const raw = (res as { data?: RawBarantumContact }).data ?? (res as RawBarantumContact)
    return transformContact(raw)
  }

  // ── Companies (the Org module) ────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    return this.listModule(credentials, params, 'Org', (r) =>
      transformCompany(r as RawBarantumCompany),
    )
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const row = await this.getOne(credentials, 'Org', 'org_uuid', id)
    return transformCompany(row as RawBarantumCompany)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const body = untransformCompany(data)
    const res = await this.writeClient(credentials).post<
      { data: RawBarantumCompany } | RawBarantumCompany
    >('/companies', body)
    const raw = (res as { data?: RawBarantumCompany }).data ?? (res as RawBarantumCompany)
    return transformCompany(raw)
  }

  // ── Deals ─────────────────────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    return this.listModule(credentials, params, 'Deals', (r) => transformDeal(r as RawBarantumDeal))
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const row = await this.getOne(credentials, 'Deals', 'deals_uuid', id)
    return transformDeal(row as RawBarantumDeal)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    const res = await this.writeClient(credentials).post<
      { data: RawBarantumDeal } | RawBarantumDeal
    >('/deals', body)
    const raw = (res as { data?: RawBarantumDeal }).data ?? (res as RawBarantumDeal)
    return transformDeal(raw)
  }

  // ── Pipelines ─────────────────────────────────────────────────────────────

  async listPipelines(_credentials: Credentials, _params: QueryParams): Promise<Pipeline[]> {
    throw notSupported(`Barantum cannot list pipelines: ${NO_PIPELINES}`)
  }

  async getPipeline(_credentials: Credentials, _id: string): Promise<Pipeline> {
    throw notSupported(`Barantum cannot read a pipeline: ${NO_PIPELINES}`)
  }

  // ── Activities (the Calls, Meetings and Tasks modules) ────────────────────

  /**
   * Calls, then Meetings, then Tasks, as one stream. The cursor is the module
   * and its page; a module past its `page_last` hands over to the next
   * module's page 1.
   */
  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const { items } = await pageByRows<Activity, string>(
      this.pagerKey(credentials, 'get_list_data/Calls+Meetings+Tasks'),
      params,
      async (cursor) => {
        const [m, p] = (cursor ?? activityCursor(0, 1)).split(':').map(Number) as [number, number]
        const spec = ACTIVITY_MODULES[m]!
        const { content, pageLast } = await getListData<Record<string, unknown>>(
          credentials,
          spec.module,
          { page: p },
        )
        const next =
          p < pageLast
            ? activityCursor(m, p + 1)
            : m + 1 < ACTIVITY_MODULES.length
              ? activityCursor(m + 1, 1)
              : undefined
        return { items: content.map((r) => transformActivityRow(spec.module, r)), next }
      },
    )
    return items
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const parsed = parseActivityId(id)
    if (!parsed) {
      throw Object.assign(
        new Error(
          `Barantum activity id ${id} names no module: expected calls:, meetings: or tasks: before the uuid`,
        ),
        { statusCode: 404 },
      )
    }
    const { spec, uuid } = parsed
    const row = await this.getOne(credentials, spec.module, spec.uuidField, uuid)
    return transformActivityRow(spec.module, row)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const body = untransformActivity(data)
    const res = await this.writeClient(credentials).post<
      { data: RawBarantumLegacyActivity } | RawBarantumLegacyActivity
    >('/activities', body)
    const raw =
      (res as { data?: RawBarantumLegacyActivity }).data ?? (res as RawBarantumLegacyActivity)
    return transformLegacyActivity(raw)
  }

  // ── Notes ─────────────────────────────────────────────────────────────────

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    return this.listModule(credentials, params, 'Notes', (r) => transformNote(r as RawBarantumNote))
  }

  async getNote(credentials: Credentials, id: string): Promise<Note> {
    const row = await this.getOne(credentials, 'Notes', 'notes_uuid', id)
    return transformNote(row as RawBarantumNote)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const body = untransformNote(data)
    const res = await this.writeClient(credentials).post<
      { data: RawBarantumNote } | RawBarantumNote
    >('/notes', body)
    const raw = (res as { data?: RawBarantumNote }).data ?? (res as RawBarantumNote)
    return transformNote(raw)
  }
}
