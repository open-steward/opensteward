import { customForm, pageOffset, reportUpstreamPage } from '@opensteward/shared'
/**
 * Teamgate adapter for the CRM vertical.
 *
 * Maps the Teamgate REST API v4 to canonical CRM resources.
 * Docs: https://developers.teamgate.com/
 *
 * ── Auth ─────────────────────────────────────────────────────────────────────
 *   Two credentials required for every request:
 *     X-App-Key    — application key  (credentials.refreshToken)
 *     X-Auth-Token — user auth token  (credentials.accessToken)
 *
 * ── Coverage ──────────────────────────────────────────────────────────────────
 *
 * Implemented:
 *   Contacts (people): list, get, create
 *   Companies: list, get, create
 *   Deals: list, get, create
 *   Pipelines: list, get
 *   Activities: list, get, create
 *
 * Omitted — registry returns HTTP 501 automatically:
 *   Notes: Teamgate v4 public API does not expose a standalone notes endpoint.
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Activity } from '../../schema/activity'
import type { WebhookEvent } from '../../schema/webhook'

import { TeamgateClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'
import { verifyWebhook as _verifyWebhook, parseWebhookEvents as _parseWebhookEvents } from './webhook'
import {
  transformContact,
  untransformContact,
  type RawTeamgatePerson,
} from './transform/contact'
import {
  transformCompany,
  untransformCompany,
  type RawTeamgateCompany,
} from './transform/company'
import {
  transformDeal,
  untransformDeal,
  type RawTeamgateDeal,
} from './transform/deal'
import {
  transformPipeline,
  type RawTeamgatePipeline,
} from './transform/pipeline'
import {
  transformActivity,
  untransformActivity,
  type RawTeamgateActivity,
} from './transform/activity'

const CREDENTIAL_FORM = customForm({
  fields: [
    {
      name: 'authToken',
      label: 'Auth Token (X-Auth-Token)',
      type: 'password',
      helpText: 'Found under My Profile > Integrations > API access.',
      required: true,
    },
    {
      name: 'appKey',
      label: 'App Key (X-App-Key)',
      type: 'password',
      helpText: 'Found under Settings > Additional features > External App.',
      required: true,
    },
  ],
  async exchange(fields: Record<string, string>): Promise<Credentials> {
    const authToken = (fields['authToken'] ?? '').trim()
    const appKey = (fields['appKey'] ?? '').trim()
    if (!authToken) throw new Error('Auth Token is required.')
    if (!appKey) throw new Error('App Key is required.')
    return {
      accessToken: authToken,  // X-Auth-Token
      refreshToken: appKey,    // X-App-Key
    }
  },
})

export class TeamgateAdapter implements CrmAdapter {

  credentialFields = CREDENTIAL_FORM.credentialFields

  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  readonly platform = 'teamgate'
  readonly version = '0.1.0'

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    // Teamgate uses API key auth — no OAuth2 flow.
    return '#api-key-auth'
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    return { accessToken: _code, refreshToken: _redirectUri }
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

  private client(credentials: Credentials): TeamgateClient {
    return new TeamgateClient(credentials)
  }

  private pageParams(params: QueryParams): Record<string, unknown> {
    return {
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
      page: Number(params['page'] ?? 1),
    }
  }

  // ── Contacts (People) ─────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const raw = await this.client(credentials).list<RawTeamgatePerson>(
      '/people',
      this.pageParams(params),
    )
    return raw.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).get<RawTeamgatePerson>(`/people/${id}`)
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const raw = await this.client(credentials).post<RawTeamgatePerson>(
      '/people',
      untransformContact(data),
    )
    return transformContact(raw)
  }

  // ── Companies ─────────────────────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const raw = await this.client(credentials).list<RawTeamgateCompany>(
      '/companies',
      this.pageParams(params),
    )
    return raw.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const raw = await this.client(credentials).get<RawTeamgateCompany>(`/companies/${id}`)
    return transformCompany(raw)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const raw = await this.client(credentials).post<RawTeamgateCompany>(
      '/companies',
      untransformCompany(data),
    )
    return transformCompany(raw)
  }

  // ── Deals ─────────────────────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const raw = await this.client(credentials).list<RawTeamgateDeal>(
      '/deals',
      this.pageParams(params),
    )
    return raw.map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const raw = await this.client(credentials).get<RawTeamgateDeal>(`/deals/${id}`)
    return transformDeal(raw)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const raw = await this.client(credentials).post<RawTeamgateDeal>(
      '/deals',
      untransformDeal(data),
    )
    return transformDeal(raw)
  }

  // ── Pipelines ─────────────────────────────────────────────────────────────

  async listPipelines(credentials: Credentials, params: QueryParams): Promise<Pipeline[]> {
    // "To paginate, use the keywords limit and offset." No maximum is
    // documented, so the caller's limit is sent as is.
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    const offset = pageOffset(params, limit)
    const { data, count, nextPage } = await this.client(credentials).listPage<RawTeamgatePipeline>(
      '/pipelines',
      { limit, offset },
    )
    // `count` is the total matching the filter. nextPage is a URL, or null /
    // false on the last page (typed [string, boolean, null] in the collection).
    const hasMore =
      count !== undefined
        ? offset + data.length < count
        : typeof nextPage === 'string'
          ? true
          : nextPage === null || nextPage === false
            ? false
            : undefined
    reportUpstreamPage(params, {
      ...(count !== undefined ? { totalCount: count } : {}),
      ...(hasMore !== undefined ? { hasMore } : {}),
    })
    return data.map(transformPipeline)
  }

  async getPipeline(credentials: Credentials, id: string): Promise<Pipeline> {
    const raw = await this.client(credentials).get<RawTeamgatePipeline>(`/pipelines/${id}`)
    return transformPipeline(raw)
  }

  // ── Activities ────────────────────────────────────────────────────────────

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const raw = await this.client(credentials).list<RawTeamgateActivity>(
      '/activities',
      this.pageParams(params),
    )
    return raw.map(transformActivity)
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const raw = await this.client(credentials).get<RawTeamgateActivity>(`/activities/${id}`)
    return transformActivity(raw)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const raw = await this.client(credentials).post<RawTeamgateActivity>(
      '/activities',
      untransformActivity(data),
    )
    return transformActivity(raw)
  }
}
