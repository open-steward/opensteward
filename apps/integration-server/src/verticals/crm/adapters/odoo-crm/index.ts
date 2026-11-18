import {
  ODOO_CREDENTIAL_FORM,
  OdooClient,
  pageOffset,
  reportUpstreamPage,
  type OdooDomain,
} from '@opensteward/shared'
/**
 * Odoo CRM adapter, on the shared Odoo client (@opensteward/shared adapter/odoo):
 * JSON-2 on Odoo 19+, External RPC (/jsonrpc execute_kw) on 14–18, as the
 * connection chooses.
 *
 * Docs: https://www.odoo.com/documentation/19.0/developer/reference/external_api.html
 *
 *   "Post a JSON object at the /json/2/<model>/<method> URL." with
 *   "Autorization — Required, bearer followed by an API key." and
 *   "X-Odoo-Database — Optional, the name of the database to connect to."
 *
 * JSON-2 is "New in version 19.0". The older /xmlrpc, /xmlrpc/2 and /jsonrpc
 * endpoints are "scheduled for removal in Odoo 22 (fall 2028)", and "Access to
 * data via the external API is only available on Custom Odoo pricing plans."
 *
 * Credentials: the shared Odoo form (baseUrl, apiVersion, database, login,
 * apiKey). Connections made with this adapter's earlier form stored
 * `extra.instanceUrl` / `extra.db` and no API version; they are refused with a
 * "reconnect" 401 and must be reconnected.
 *
 * Every list is one `search_read` page: "offset and limit parameters are
 * available to only retrieve a subset of all matched records" (19.0
 * external_rpc_api, Pagination). No maximum is documented — "limit – maximum
 * number of records to return (default: all)" — so none is declared.
 *
 * Coverage:
 *   - Contacts   (res.partner, is_company = false, type = 'contact')
 *   - Companies  (res.partner, is_company = true)
 *   - Deals      (crm.lead, type = 'opportunity')
 *   - Pipelines  (crm.team with use_opportunities, and the crm.stage columns each shows)
 *   - Activities (mail.activity)
 *   - Notes      (mail.message, message_type = 'comment', on res.partner / crm.lead)
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { WebhookEvent } from '../../schema/webhook'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'

import { verifyWebhook, parseWebhookEvents } from './webhook'
import { DEFAULT_LIMIT } from './constants'
import {
  CONTACT_FIELDS,
  transformContact,
  untransformContact,
  type RawOdooContact,
} from './transform/contact'
import {
  COMPANY_FIELDS,
  transformCompany,
  untransformCompany,
  type RawOdooCompany,
} from './transform/company'
import { DEAL_FIELDS, transformDeal, untransformDeal, type RawOdooDeal } from './transform/deal'
import {
  STAGE_FIELDS,
  STAGE_ORDER,
  TEAM_FIELDS,
  transformPipeline,
  type RawOdooStage,
  type RawOdooTeam,
} from './transform/pipeline'
import {
  ACTIVITY_FIELDS,
  transformActivity,
  untransformActivity,
  type RawOdooActivity,
} from './transform/activity'
import { NOTE_FIELDS, transformNote, untransformNote, type RawOdooNote } from './transform/note'

const CONTACT_DOMAIN: OdooDomain = [
  ['is_company', '=', false],
  ['type', '=', 'contact'],
]
const COMPANY_DOMAIN: OdooDomain = [['is_company', '=', true]]
const DEAL_DOMAIN: OdooDomain = [['type', '=', 'opportunity']]
const PIPELINE_DOMAIN: OdooDomain = [['use_opportunities', '=', true]]
const ACTIVITY_DOMAIN: OdooDomain = []
const NOTE_DOMAIN: OdooDomain = [
  ['message_type', '=', 'comment'],
  ['model', 'in', ['res.partner', 'crm.lead']],
]

export interface OdooCrmAdapterConfig {
  /** Unused: the Odoo URL is per connection, in `credentials.extra.baseUrl` (the shared Odoo form). */
  instanceUrl?: string
}

const CREDENTIAL_FORM = ODOO_CREDENTIAL_FORM

function notFound(what: string, id: string): Error {
  return Object.assign(new Error(`Odoo: ${what} ${id} not found`), { statusCode: 404 })
}

/** Odoo record ids are integers; anything else names no record. */
function recordId(what: string, id: string): number {
  if (!/^[1-9]\d*$/.test(id)) throw notFound(what, id)
  return Number(id)
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

export class OdooCrmAdapter implements CrmAdapter {
  // Connect Link support — the shared Odoo form.
  credentialFields = CREDENTIAL_FORM.credentialFields
  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  readonly platform = 'odoo-crm'
  readonly version = '0.3.0'

  constructor(_config: OdooCrmAdapterConfig = {}) {}

  // ── Auth (API key — no OAuth2) ────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    // Odoo uses API key auth — no OAuth2 redirect URL
    return '#api-key-auth'
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('OdooCrmAdapter: OAuth2 not supported. Use API key auth.')
  }

  /** An API key is sent as is on every call; there is nothing to refresh. */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseWebhookEvents(payload)
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private client(credentials: Credentials): OdooClient {
    return new OdooClient(credentials)
  }

  /**
   * One caller page of `model`: `offset` = (page − 1) × limit, the caller's
   * `limit`, in id order, with `search_count` for the total (OdooClient.searchPage).
   */
  private async pageOf<T>(
    credentials: Credentials,
    params: QueryParams,
    model: string,
    domain: OdooDomain,
    fields: string[],
  ): Promise<T[]> {
    const limit = pageLimit(params)
    const offset = pageOffset(params, limit)
    const page = await this.client(credentials).searchPage<T>(model, {
      domain,
      fields,
      offset,
      limit,
    })
    reportUpstreamPage(params, {
      hasMore: page.hasMore,
      ...(page.totalCount !== undefined ? { totalCount: page.totalCount } : {}),
    })
    return page.rows
  }

  /**
   * One record of `model` by id, or a 404. `read`, not `search_read`: the
   * latter's default active filter would 404 every archived record, and Odoo
   * archives each lost deal ("elif not lead.active and lead.probability == 0:
   * lead.won_status = 'lost'", crm_lead.py 19.0).
   */
  private async one<T>(
    credentials: Credentials,
    what: string,
    model: string,
    id: string,
    fields: string[],
  ): Promise<T> {
    const n = recordId(what, id)
    const rows = await this.client(credentials).read<T>(model, [n], fields)
    const row = rows[0]
    if (!row) throw notFound(what, id)
    return row
  }

  // ── Contacts (res.partner, individuals) ───────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const rows = await this.pageOf<RawOdooContact>(
      credentials,
      params,
      'res.partner',
      CONTACT_DOMAIN,
      CONTACT_FIELDS,
    )
    return rows.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    return transformContact(
      await this.one<RawOdooContact>(credentials, 'contact', 'res.partner', id, CONTACT_FIELDS),
    )
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const values = untransformContact(data)
    const newId = await this.client(credentials).create('res.partner', values)
    return this.getContact(credentials, String(newId))
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    await this.client(credentials).write(
      'res.partner',
      [recordId('contact', id)],
      untransformContact(data),
    )
    return this.getContact(credentials, id)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).unlink('res.partner', [recordId('contact', id)])
  }

  // ── Companies (res.partner is_company=true) ───────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const rows = await this.pageOf<RawOdooCompany>(
      credentials,
      params,
      'res.partner',
      COMPANY_DOMAIN,
      COMPANY_FIELDS,
    )
    return rows.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    return transformCompany(
      await this.one<RawOdooCompany>(credentials, 'company', 'res.partner', id, COMPANY_FIELDS),
    )
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const values = untransformCompany(data)
    const newId = await this.client(credentials).create('res.partner', values)
    return this.getCompany(credentials, String(newId))
  }

  async updateCompany(
    credentials: Credentials,
    id: string,
    data: Partial<Company>,
  ): Promise<Company> {
    await this.client(credentials).write(
      'res.partner',
      [recordId('company', id)],
      untransformCompany(data),
    )
    return this.getCompany(credentials, id)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).unlink('res.partner', [recordId('company', id)])
  }

  // ── Deals (crm.lead type='opportunity') ───────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const rows = await this.pageOf<RawOdooDeal>(
      credentials,
      params,
      'crm.lead',
      DEAL_DOMAIN,
      DEAL_FIELDS,
    )
    return rows.map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    return transformDeal(
      await this.one<RawOdooDeal>(credentials, 'deal', 'crm.lead', id, DEAL_FIELDS),
    )
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const values = untransformDeal(data)
    const newId = await this.client(credentials).create('crm.lead', values)
    return this.getDeal(credentials, String(newId))
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    await this.client(credentials).write('crm.lead', [recordId('deal', id)], untransformDeal(data))
    return this.getDeal(credentials, id)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).unlink('crm.lead', [recordId('deal', id)])
  }

  // ── Pipelines (crm.team with use_opportunities, and their crm.stage columns) ──

  /** Every stage, in `crm.stage` order ("limit … (default: all)"). */
  private async allStages(credentials: Credentials): Promise<RawOdooStage[]> {
    return this.client(credentials).searchRead<RawOdooStage>('crm.stage', {
      domain: [],
      fields: STAGE_FIELDS,
      order: STAGE_ORDER,
    })
  }

  async listPipelines(credentials: Credentials, params: QueryParams): Promise<Pipeline[]> {
    const teams = await this.pageOf<RawOdooTeam>(
      credentials,
      params,
      'crm.team',
      PIPELINE_DOMAIN,
      TEAM_FIELDS,
    )
    if (teams.length === 0) return []
    const stages = await this.allStages(credentials)
    return teams.map((team) => transformPipeline(team, stages))
  }

  async getPipeline(credentials: Credentials, id: string): Promise<Pipeline> {
    const team = await this.one<RawOdooTeam>(credentials, 'pipeline', 'crm.team', id, TEAM_FIELDS)
    return transformPipeline(team, await this.allStages(credentials))
  }

  // ── Activities (mail.activity) ────────────────────────────────────────────

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const rows = await this.pageOf<RawOdooActivity>(
      credentials,
      params,
      'mail.activity',
      ACTIVITY_DOMAIN,
      ACTIVITY_FIELDS,
    )
    return rows.map(transformActivity)
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    return transformActivity(
      await this.one<RawOdooActivity>(
        credentials,
        'activity',
        'mail.activity',
        id,
        ACTIVITY_FIELDS,
      ),
    )
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const values = untransformActivity(data)
    const newId = await this.client(credentials).create('mail.activity', values)
    return this.getActivity(credentials, String(newId))
  }

  async updateActivity(
    credentials: Credentials,
    id: string,
    data: Partial<Activity>,
  ): Promise<Activity> {
    await this.client(credentials).write(
      'mail.activity',
      [recordId('activity', id)],
      untransformActivity(data),
    )
    return this.getActivity(credentials, id)
  }

  async deleteActivity(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).unlink('mail.activity', [recordId('activity', id)])
  }

  // ── Notes (mail.message message_type='comment') ───────────────────────────

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const rows = await this.pageOf<RawOdooNote>(
      credentials,
      params,
      'mail.message',
      NOTE_DOMAIN,
      NOTE_FIELDS,
    )
    return rows.map(transformNote)
  }

  async getNote(credentials: Credentials, id: string): Promise<Note> {
    return transformNote(
      await this.one<RawOdooNote>(credentials, 'note', 'mail.message', id, NOTE_FIELDS),
    )
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const values = untransformNote(data)
    const newId = await this.client(credentials).create('mail.message', values)
    return this.getNote(credentials, String(newId))
  }

  async deleteNote(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).unlink('mail.message', [recordId('note', id)])
  }
}
