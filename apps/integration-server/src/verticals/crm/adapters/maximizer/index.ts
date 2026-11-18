import { reportUpstreamPage, simpleApiKey } from '@opensteward/shared'
/**
 * Maximizer CRM adapter for the CRM vertical, on the Octopus API
 * (Maximizer.Web.Data).
 *
 * Docs: https://developer.maximizer.com/reference/octopus-api
 *
 * Auth: "The authentication token must be passed as a header -
 * "Authorization" with the specified type `Bearer`." A Personal Access Token
 * is a documented way to get one
 * (https://developer.maximizer.com/docs/personal-access-token).
 *
 * Reads: every read is `POST https://api.maximizer.com/octopus/Read` with a
 * JSON body keyed by the object name (Scope, Criteria, OrderBy). An on-premise
 * install's BaseURL is read from credentials.extra.instanceUrl.
 *
 * Paging: Octopus pages by `OrderBy.PageKey`, but "Octopus API returns the key
 * of the next page in the response" is all the docs say — no response example
 * and no field name for that key, in the docs or the first-party Postman
 * collection. So the list methods page by the documented `Criteria.Top` ("The
 * `Top` operator is used to limit the number of results") instead: page N asks
 * for the first N × limit rows in a fixed order and serves the last `limit`.
 * That costs more rows per request as N grows, but every row is reachable and
 * served once, with no invented cursor.
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { WebhookEvent } from '../../schema/webhook'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'

import { MaximizerClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'
import {
  verifyWebhook as _verifyWebhook,
  parseWebhookEvents as _parseWebhookEvents,
} from './webhook'
import { transformContact, untransformContact, type RawMaximizerContact } from './transform/contact'
import { transformCompany, untransformCompany, type RawMaximizerCompany } from './transform/company'
import { transformDeal, untransformDeal, type RawMaximizerDeal } from './transform/deal'
import {
  transformPipeline,
  type RawMaximizerSalesProcess,
  type RawMaximizerSalesStage,
} from './transform/pipeline'
import {
  transformActivity,
  untransformActivity,
  type RawMaximizerActivity,
} from './transform/activity'
import { transformNote, untransformNote, type RawMaximizerNote } from './transform/note'

export interface MaximizerAdapterConfig {
  instanceUrl?: string
}
const SIMPLE_API_KEY_FORM = simpleApiKey()

// ── Read bodies (each from a first-party Octopus Read example) ─────────────

const ADDRESS_FIELDS = {
  AddressLine1: 1,
  AddressLine2: 1,
  City: 1,
  StateProvince: 1,
  ZipCode: 1,
  Country: 1,
}

/** "Read - AbEntry by Key (Contact or Individual)" and "Read - Contacts with pagination". */
const CONTACT_FIELDS = {
  Key: 1,
  Type: 1,
  FirstName: 1,
  LastName: 1,
  Email: 1,
  Phone: 1,
  Position: 1,
  Parent: { Key: 1, Type: 1 },
  Address: ADDRESS_FIELDS,
  CreationDate: 1,
  LastModifyDate: 1,
}
const PERSON_TYPES = { Type: { $IN: ['Contact', 'Individual'] } }

/** "Read - Companies" / "Read - AbEntry" (Website, Phone, Address). */
const COMPANY_FIELDS = {
  Key: 1,
  Type: 1,
  CompanyName: 1,
  Phone: 1,
  Address: ADDRESS_FIELDS,
  CreationDate: 1,
  LastModifyDate: 1,
}
const COMPANY_TYPE = { Type: { $EQ: 'Company' } }

/** "Read - AbEntry" needs this driver "for displaying Parent property". */
const ABENTRY_OPTIONS = {
  Compatibility: { AbEntryKey: '2.0' },
  Configuration: {
    Drivers: { IAbEntrySearcher: 'Maximizer.Model.Access.Sql.AbEntrySearcher' },
  },
}

/** "Read - Opportunity", "Read Current Sales Stage (Instance) from Opportunity". */
const DEAL_FIELDS = {
  Key: 1,
  Objective: 1,
  Status: { Key: 1, DisplayValue: 1 },
  ForecastRevenue: { Value: 1, CurrencyCode: 1 },
  AbEntry: { Key: 1, Type: 1 },
  SalesProcessSetupKey: 1,
  SalesStageSetupKey: 1,
  CurrentSalesStage: { Description: 1 },
  CloseDate: 1,
  CreationDate: 1,
}
const DEAL_OPTIONS = {
  Compatibility: { AbEntryKey: '2.0' },
  Configuration: {
    Drivers: { IOpportunitySearcher: 'Maximizer.Model.Access.Sql.OpportunitySearcher' },
  },
}

/** "Read - SalesProcessSetup" / "Read - SalesStageSetup". */
const PROCESS_FIELDS = { Key: 1, Description: 1 }
const STAGE_FIELDS = { Key: 1, Description: 1, SalesProcessSetupKey: 1, ProbabilityClose: 1 }

/** "Read - Task": the driver is "Required for using Top in Criteria". */
const TASK_FIELDS = { Key: 1, Activity: 1, DateTime: 1, Completed: 1 }
const TASK_OPTIONS = {
  Compatibility: { AbEntryKey: '2.0' },
  Configuration: { Drivers: { ITaskSearcher: 'Maximizer.Model.Access.Sql.TaskSearcher' } },
}

/** "Read - Note". */
const NOTE_FIELDS = { Key: 1, Text: 1, RichText: 1, DateTime: 1, ParentKey: 1 }

function byKey(id: string): Record<string, unknown> {
  return { Key: { $EQ: id } }
}

function notFound(what: string, id: string): Error {
  return Object.assign(new Error(`Maximizer ${what} ${id} not found`), { statusCode: 404 })
}

export class MaximizerAdapter implements CrmAdapter {
  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'maximizer'
  readonly version = '0.1.0'

  constructor(_config: MaximizerAdapterConfig = {}) {}

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    return '#api-key-auth'
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('Maximizer: use token auth — set accessToken (a Personal Access Token)')
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

  private c(creds: Credentials): MaximizerClient {
    return new MaximizerClient(creds)
  }

  /**
   * One caller page of an Octopus Read, by `Criteria.Top`.
   *
   * Page N asks for the first N × limit rows (`Top`) in the order `orderBy`
   * fixes, and serves rows (N-1) × limit … N × limit - 1. Fewer rows than
   * asked for means the collection ended inside this page, so `hasMore` is
   * reported false; a full answer reports nothing, and the caller asks for
   * the next page.
   */
  private async topPage<T>(
    creds: Credentials,
    object: string,
    params: QueryParams,
    query: {
      fields: Record<string, unknown>
      search: Record<string, unknown>
      orderBy?: Record<string, 'ASC' | 'DESC'>
      options?: Record<string, unknown>
    },
  ): Promise<T[]> {
    const rawLimit = params.limit
    const limit =
      typeof rawLimit === 'number' && Number.isFinite(rawLimit) && rawLimit >= 1
        ? Math.floor(rawLimit)
        : DEFAULT_PAGE_SIZE
    const rawPage = params.page
    const page =
      typeof rawPage === 'number' && Number.isFinite(rawPage) && rawPage >= 1
        ? Math.floor(rawPage)
        : 1
    const top = page * limit
    const rows = await this.c(creds).read<T>(object, {
      [object]: {
        Scope: { Fields: query.fields },
        Criteria: { SearchQuery: query.search, Top: top },
        ...(query.orderBy ? { OrderBy: { Fields: [query.orderBy] } } : {}),
      },
      ...query.options,
    })
    if (rows.length < top) reportUpstreamPage(params, { hasMore: false })
    const lo = (page - 1) * limit
    return rows.slice(lo, lo + limit)
  }

  /** One record by its Key, or 404 when the Read finds none. */
  private async one<T>(
    creds: Credentials,
    object: string,
    what: string,
    id: string,
    fields: Record<string, unknown>,
    search: Record<string, unknown>,
    options: Record<string, unknown> = {},
  ): Promise<T> {
    const rows = await this.c(creds).read<T>(object, {
      [object]: { Scope: { Fields: fields }, Criteria: { SearchQuery: search, Top: 1 } },
      ...options,
    })
    const hit = rows[0]
    if (!hit) throw notFound(what, id)
    return hit
  }

  // ── Contacts ──────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const rows = await this.topPage<RawMaximizerContact>(credentials, 'AbEntry', params, {
      fields: CONTACT_FIELDS,
      search: PERSON_TYPES,
      orderBy: { CreationDate: 'ASC' },
      options: ABENTRY_OPTIONS,
    })
    return rows.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.one<RawMaximizerContact>(
      credentials,
      'AbEntry',
      'contact',
      id,
      CONTACT_FIELDS,
      { $AND: [byKey(id), PERSON_TYPES] },
      ABENTRY_OPTIONS,
    )
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const raw = await this.c(credentials).post<RawMaximizerContact>(
      '/People/',
      untransformContact(data),
    )
    return transformContact(raw)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const raw = await this.c(credentials).put<RawMaximizerContact>(
      `/People/${id}`,
      untransformContact(data),
    )
    return transformContact(raw)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.c(credentials).delete(`/People/${id}`)
  }

  // ── Companies ─────────────────────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const rows = await this.topPage<RawMaximizerCompany>(credentials, 'AbEntry', params, {
      fields: COMPANY_FIELDS,
      search: COMPANY_TYPE,
      orderBy: { CreationDate: 'ASC' },
      options: ABENTRY_OPTIONS,
    })
    return rows.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const raw = await this.one<RawMaximizerCompany>(
      credentials,
      'AbEntry',
      'company',
      id,
      COMPANY_FIELDS,
      { $AND: [byKey(id), COMPANY_TYPE] },
      ABENTRY_OPTIONS,
    )
    return transformCompany(raw)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const raw = await this.c(credentials).post<RawMaximizerCompany>(
      '/Companies/',
      untransformCompany(data),
    )
    return transformCompany(raw)
  }

  async updateCompany(
    credentials: Credentials,
    id: string,
    data: Partial<Company>,
  ): Promise<Company> {
    const raw = await this.c(credentials).put<RawMaximizerCompany>(
      `/Companies/${id}`,
      untransformCompany(data),
    )
    return transformCompany(raw)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.c(credentials).delete(`/Companies/${id}`)
  }

  // ── Deals (Opportunities) ─────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const rows = await this.topPage<RawMaximizerDeal>(credentials, 'Opportunity', params, {
      fields: DEAL_FIELDS,
      search: {},
      orderBy: { CreationDate: 'ASC' },
      options: DEAL_OPTIONS,
    })
    return rows.map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const raw = await this.one<RawMaximizerDeal>(
      credentials,
      'Opportunity',
      'opportunity',
      id,
      DEAL_FIELDS,
      byKey(id),
      DEAL_OPTIONS,
    )
    return transformDeal(raw)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const raw = await this.c(credentials).post<RawMaximizerDeal>(
      '/Opportunities/',
      untransformDeal(data),
    )
    return transformDeal(raw)
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const raw = await this.c(credentials).put<RawMaximizerDeal>(
      `/Opportunities/${id}`,
      untransformDeal(data),
    )
    return transformDeal(raw)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.c(credentials).delete(`/Opportunities/${id}`)
  }

  // ── Pipelines (SalesProcessSetup + SalesStageSetup) ───────────────────────

  /** Every SalesStageSetup row of the given sales processes, in one Read. */
  private async stagesOf(
    credentials: Credentials,
    processKeys: string[],
  ): Promise<RawMaximizerSalesStage[]> {
    if (processKeys.length === 0) return []
    return this.c(credentials).read<RawMaximizerSalesStage>('SalesStageSetup', {
      SalesStageSetup: {
        Scope: { Fields: STAGE_FIELDS },
        Criteria: { SearchQuery: { SalesProcessSetupKey: { $IN: processKeys } } },
      },
    })
  }

  async listPipelines(credentials: Credentials, params: QueryParams): Promise<Pipeline[]> {
    const processes = await this.topPage<RawMaximizerSalesProcess>(
      credentials,
      'SalesProcessSetup',
      params,
      { fields: PROCESS_FIELDS, search: {} },
    )
    const stages = await this.stagesOf(
      credentials,
      processes.map((p) => p.Key),
    )
    return processes.map((p) => transformPipeline(p, stages))
  }

  async getPipeline(credentials: Credentials, id: string): Promise<Pipeline> {
    const raw = await this.one<RawMaximizerSalesProcess>(
      credentials,
      'SalesProcessSetup',
      'sales process',
      id,
      PROCESS_FIELDS,
      byKey(id),
    )
    return transformPipeline(raw, await this.stagesOf(credentials, [raw.Key]))
  }

  // ── Activities (Tasks) ────────────────────────────────────────────────────

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const rows = await this.topPage<RawMaximizerActivity>(credentials, 'Task', params, {
      fields: TASK_FIELDS,
      search: {},
      orderBy: { DateTime: 'ASC' },
      options: TASK_OPTIONS,
    })
    return rows.map(transformActivity)
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const raw = await this.one<RawMaximizerActivity>(
      credentials,
      'Task',
      'task',
      id,
      TASK_FIELDS,
      byKey(id),
      TASK_OPTIONS,
    )
    return transformActivity(raw)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const raw = await this.c(credentials).post<RawMaximizerActivity>(
      '/Activities/',
      untransformActivity(data),
    )
    return transformActivity(raw)
  }

  async updateActivity(
    credentials: Credentials,
    id: string,
    data: Partial<Activity>,
  ): Promise<Activity> {
    const raw = await this.c(credentials).put<RawMaximizerActivity>(
      `/Activities/${id}`,
      untransformActivity(data),
    )
    return transformActivity(raw)
  }

  async deleteActivity(credentials: Credentials, id: string): Promise<void> {
    await this.c(credentials).delete(`/Activities/${id}`)
  }

  // ── Notes ─────────────────────────────────────────────────────────────────

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const rows = await this.topPage<RawMaximizerNote>(credentials, 'Note', params, {
      fields: NOTE_FIELDS,
      search: {},
      orderBy: { DateTime: 'ASC' },
    })
    return rows.map(transformNote)
  }

  async getNote(credentials: Credentials, id: string): Promise<Note> {
    const raw = await this.one<RawMaximizerNote>(
      credentials,
      'Note',
      'note',
      id,
      NOTE_FIELDS,
      byKey(id),
    )
    return transformNote(raw)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const raw = await this.c(credentials).post<RawMaximizerNote>('/Notes/', untransformNote(data))
    return transformNote(raw)
  }

  async updateNote(credentials: Credentials, id: string, data: Partial<Note>): Promise<Note> {
    const raw = await this.c(credentials).put<RawMaximizerNote>(
      `/Notes/${id}`,
      untransformNote(data),
    )
    return transformNote(raw)
  }

  async deleteNote(credentials: Credentials, id: string): Promise<void> {
    await this.c(credentials).delete(`/Notes/${id}`)
  }
}
