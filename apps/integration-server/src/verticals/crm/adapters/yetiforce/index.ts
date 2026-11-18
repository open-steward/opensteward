import { customForm, pageLocally, pageOffset, reportUpstreamPage } from '@opensteward/shared'
/**
 * YetiForce CRM adapter for the CRM vertical.
 *
 * Maps YetiForce's Webservice Premium REST API to canonical CRM resources.
 * Spec: https://doc.yetiforce.com/api/7x/WebservicePremium.json
 * Guide: https://doc.yetiforce.com/en/developer-guides/api/first-connect/
 *
 * Auth (see client.ts): X-API-KEY + HTTP Basic (the Web service - applications
 * name and password) + X-TOKEN from POST Users/Login (a Web service - users
 * login). Base URL: ${instanceUrl}/webservice/WebservicePremium.
 *
 * Reads:
 *   - lists: GET /{moduleName}/RecordsList, paged by the x-row-offset and
 *     x-row-limit headers, ended by result.isMorePages, rows from
 *     result.rawData (x-raw-data: 1);
 *   - gets: GET /{moduleName}/Record/{recordId}, result.rawData;
 *   - pipelines: GET /SSalesProcesses/Fields, the ssalesprocesses_status
 *     picklist (see transform/pipeline.ts).
 *
 * Modules: Contacts, Accounts, SSalesProcesses (YetiForce's opportunities:
 * there is no Opportunities or Potentials module), Calendar, ModComments.
 *
 * Writes (create/update/delete) are unchanged by the paging rebuild and
 * still use paths the spec does not document (POST /{module} instead of
 * /{module}/Record, PUT/DELETE /{module}/{id} instead of
 * /{module}/Record/{recordId}), and deals still write to 'Opportunities'.
 * They also map the write response through the read transforms, but a write
 * response carries the id rather than the record's raw data, so
 * createCompany/createDeal/createNote (and the updates) would throw 502 on
 * the missing mandatory field after the record was written. Rebuild them
 * onto /{module}/Record and read the record back with GET Record.
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { WebhookEvent } from '../../schema/webhook'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'

import { YetiForceClient } from './client'
import { verifyWebhook, parseWebhookEvents } from './webhook'
import { CONTACT_FIELDS, transformContact, untransformContact } from './transform/contact'
import { ACCOUNT_FIELDS, transformCompany, untransformCompany } from './transform/company'
import { DEAL_FIELDS, transformDeal, untransformDeal } from './transform/deal'
import { PIPELINE_FIELD, transformPipeline } from './transform/pipeline'
import { ACTIVITY_FIELDS, transformActivity, untransformActivity } from './transform/activity'
import { NOTE_FIELDS, transformNote, untransformNote } from './transform/note'

/** "Get rows limit, default: 100" (x-row-limit, WebservicePremium.json). No maximum is documented. */
const DEFAULT_ROW_LIMIT = 100

const YETIFORCE_FORM = customForm({
  fields: [
    {
      name: 'instanceUrl',
      label: 'YetiForce URL',
      type: 'text',
      required: true,
      helpText: 'The address of your YetiForce instance, e.g. https://crm.example.com',
    },
    {
      name: 'apiKey',
      label: 'API key',
      type: 'password',
      required: true,
      helpText:
        'Administration → Integration → Web service - Applications: the key of a Webservice Premium application.',
    },
    {
      name: 'appName',
      label: 'Application name',
      type: 'text',
      required: true,
      helpText: 'The Name of that Web service - Applications entry (sent as the Basic auth user).',
    },
    {
      name: 'appPassword',
      label: 'Application password',
      type: 'password',
      required: true,
      helpText: 'The Password of that Web service - Applications entry.',
    },
    {
      name: 'userName',
      label: 'Web service user name',
      type: 'text',
      required: true,
      helpText: 'Administration → Integration → Web service - Users: a user of that application.',
    },
    {
      name: 'password',
      label: 'Web service user password',
      type: 'password',
      required: true,
    },
  ],
  async exchange(input: Record<string, string>): Promise<Credentials> {
    const instanceUrl = (input?.['instanceUrl'] ?? '').trim().replace(/\/+$/, '')
    const apiKey = (input?.['apiKey'] ?? '').trim()
    const appName = (input?.['appName'] ?? '').trim()
    const appPassword = input?.['appPassword'] ?? ''
    const userName = (input?.['userName'] ?? '').trim()
    const password = input?.['password'] ?? ''
    if (!instanceUrl || !apiKey || !appName || !appPassword || !userName || !password) {
      throw new Error(
        'YetiForce needs the instance URL, the API key, application name and password, and a web service user name and password.',
      )
    }
    return { accessToken: apiKey, extra: { instanceUrl, appName, appPassword, userName, password } }
  },
})

function writtenId(result: unknown): string {
  const id = (result as Record<string, unknown> | undefined)?.['id']
  if (typeof id !== 'number' && typeof id !== 'string') {
    throw Object.assign(new Error('YetiForce returned no record id'), { statusCode: 502 })
  }
  return String(id)
}

// no OAuth config needed — API key + application + web service user auth
export type YetiForceAdapterConfig = Record<string, never>

type Row = [string, Record<string, unknown>]

export class YetiForceAdapter implements CrmAdapter {
  // Connect Link support — instance URL, application key/name/password, web service user.

  credentialFields = YETIFORCE_FORM.credentialFields

  exchangeCredentials = YETIFORCE_FORM.exchangeCredentials

  readonly platform = 'yetiforce'
  readonly version = '0.2.0'

  constructor(_config: YetiForceAdapterConfig = {}) {}

  // ── Auth (credential form) ────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    return '#api-key-auth'
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    return { accessToken: '' }
  }

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

  private client(credentials: Credentials): YetiForceClient {
    return new YetiForceClient(credentials)
  }

  /**
   * The caller's page of a module: x-row-offset = (page - 1) × limit and
   * x-row-limit = limit, exactly as asked (no maximum is documented), with
   * hasMore from result.isMorePages.
   */
  private async listPage<T>(
    credentials: Credentials,
    params: QueryParams,
    module: string,
    fields: readonly string[],
    map: (row: Row, rawTimeZone: string) => T,
  ): Promise<T[]> {
    const asked = Number(params.limit ?? DEFAULT_ROW_LIMIT)
    if (!Number.isFinite(asked) || asked < 1) {
      throw Object.assign(
        new RangeError(`YetiForce: limit must be a number >= 1 (got ${String(params.limit)})`),
        {
          statusCode: 400,
        },
      )
    }
    const limit = Math.floor(asked)
    const page = await this.client(credentials).recordsList(
      module,
      fields,
      limit,
      pageOffset(params, limit),
    )
    reportUpstreamPage(params, { hasMore: page.isMorePages })
    return page.rows.map((row) => map(row, page.rawTimeZone))
  }

  // ── Contacts ───────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    return this.listPage(credentials, params, 'Contacts', CONTACT_FIELDS, ([id, raw], tz) =>
      transformContact(id, raw, tz),
    )
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const r = await this.client(credentials).record('Contacts', id)
    return transformContact(r.id, r.raw, r.rawTimeZone)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    const { result, rawTimeZone } = await this.client(credentials).post<Record<string, unknown>>(
      'Contacts',
      body,
    )
    return transformContact(writtenId(result), result, rawTimeZone)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const body = untransformContact(data)
    const { result, rawTimeZone } = await this.client(credentials).put<Record<string, unknown>>(
      'Contacts',
      id,
      body,
    )
    return transformContact(writtenId(result), result, rawTimeZone)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete('Contacts', id)
  }

  // ── Companies (Accounts in YetiForce) ─────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    return this.listPage(credentials, params, 'Accounts', ACCOUNT_FIELDS, ([id, raw], tz) =>
      transformCompany(id, raw, tz),
    )
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const r = await this.client(credentials).record('Accounts', id)
    return transformCompany(r.id, r.raw, r.rawTimeZone)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const body = untransformCompany(data)
    const { result, rawTimeZone } = await this.client(credentials).post<Record<string, unknown>>(
      'Accounts',
      body,
    )
    return transformCompany(writtenId(result), result, rawTimeZone)
  }

  async updateCompany(
    credentials: Credentials,
    id: string,
    data: Partial<Company>,
  ): Promise<Company> {
    const body = untransformCompany(data)
    const { result, rawTimeZone } = await this.client(credentials).put<Record<string, unknown>>(
      'Accounts',
      id,
      body,
    )
    return transformCompany(writtenId(result), result, rawTimeZone)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete('Accounts', id)
  }

  // ── Deals (SSalesProcesses in YetiForce) ──────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    return this.listPage(credentials, params, 'SSalesProcesses', DEAL_FIELDS, ([id, raw], tz) =>
      transformDeal(id, raw, tz),
    )
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const r = await this.client(credentials).record('SSalesProcesses', id)
    return transformDeal(r.id, r.raw, r.rawTimeZone)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    const { result, rawTimeZone } = await this.client(credentials).post<Record<string, unknown>>(
      'Opportunities',
      body,
    )
    return transformDeal(writtenId(result), result, rawTimeZone)
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    const { result, rawTimeZone } = await this.client(credentials).put<Record<string, unknown>>(
      'Opportunities',
      id,
      body,
    )
    return transformDeal(writtenId(result), result, rawTimeZone)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete('Opportunities', id)
  }

  // ── Pipelines (the SSalesProcesses status picklist) ───────────────────────

  async listPipelines(credentials: Credentials, params: QueryParams): Promise<Pipeline[]> {
    const fields = await this.client(credentials).fields('SSalesProcesses')
    const status = fields[PIPELINE_FIELD]
    return pageLocally(status ? [transformPipeline(status)] : [], params)
  }

  // ── Activities (Calendar in YetiForce) ────────────────────────────────────

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    return this.listPage(credentials, params, 'Calendar', ACTIVITY_FIELDS, ([id, raw], tz) =>
      transformActivity(id, raw, tz),
    )
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const r = await this.client(credentials).record('Calendar', id)
    return transformActivity(r.id, r.raw, r.rawTimeZone)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const body = untransformActivity(data)
    const { result, rawTimeZone } = await this.client(credentials).post<Record<string, unknown>>(
      'Calendar',
      body,
    )
    return transformActivity(writtenId(result), result, rawTimeZone)
  }

  async updateActivity(
    credentials: Credentials,
    id: string,
    data: Partial<Activity>,
  ): Promise<Activity> {
    const body = untransformActivity(data)
    const { result, rawTimeZone } = await this.client(credentials).put<Record<string, unknown>>(
      'Calendar',
      id,
      body,
    )
    return transformActivity(writtenId(result), result, rawTimeZone)
  }

  async deleteActivity(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete('Calendar', id)
  }

  // ── Notes (ModComments in YetiForce) ──────────────────────────────────────

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    return this.listPage(credentials, params, 'ModComments', NOTE_FIELDS, ([id, raw], tz) =>
      transformNote(id, raw, tz),
    )
  }

  async getNote(credentials: Credentials, id: string): Promise<Note> {
    const r = await this.client(credentials).record('ModComments', id)
    return transformNote(r.id, r.raw, r.rawTimeZone)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const body = untransformNote(data)
    const { result, rawTimeZone } = await this.client(credentials).post<Record<string, unknown>>(
      'ModComments',
      body,
    )
    return transformNote(writtenId(result), result, rawTimeZone)
  }
}
