import { simpleApiKey } from '@opensteward/shared'
/**
 * Nutshell adapter for the CRM vertical.
 *
 * Maps the Nutshell JSON-RPC API v1 to canonical CRM resources.
 * Docs: https://developers.nutshell.com/
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Implemented (11):
 *   Contacts:   list, get, create, update, delete
 *   Companies:  list, get, create, update, delete
 *   Deals:      list, get, create, update, delete
 *   Pipelines:  list
 *   Activities: list, get, create, update
 *   Auth:       getAuthUrl, exchangeCode, refreshCredentials
 *   Webhooks:   verifyWebhook, parseWebhookEvents
 *
 * Omitted — registry returns HTTP 501 automatically:
 *   Notes:              no notes API in Nutshell
 *   Activities delete:  not supported in Nutshell API
 *   Pipelines get:      no individual milestone get endpoint
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { WebhookEvent } from '../../schema/webhook'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Activity } from '../../schema/activity'

import { NutshellClient } from './client'
import { verifyWebhook, parseWebhookEvents } from './webhook'
import {
  transformContact,
  untransformContact,
  type RawNutshellContact,
} from './transform/contact'
import {
  transformCompany,
  untransformCompany,
  type RawNutshellCompany,
} from './transform/company'
import {
  transformDeal,
  untransformDeal,
  type RawNutshellDeal,
} from './transform/deal'
import {
  transformPipelineFromMilestones,
  type RawNutshellMilestone,
} from './transform/pipeline'
import {
  transformActivity,
  untransformActivity,
  type RawNutshellActivity,
} from './transform/activity'

export interface NutshellAdapterConfig {
  /** Nutshell account username (email). */
  username?: string
  /** Nutshell API key. */
  apiKey?: string
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class NutshellAdapter implements CrmAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'nutshell'
  readonly version = '0.1.0'

  private username: string | undefined
  private apiKey: string | undefined

  constructor(config: NutshellAdapterConfig = {}) {
    this.username = config.username
    this.apiKey = config.apiKey
  }

  // ── Auth ───────────────────────────────────────────────────────────────────
  // Nutshell uses HTTP Basic auth — no OAuth redirect flow.

  getAuthUrl(_state: string): string {
    // Nutshell uses API keys — direct the user to the API settings page
    return 'https://app.nutshell.com/setup/api'
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    // Credentials are supplied directly as username + apiKey
    const accessToken = Buffer.from(
      `${this.username ?? ''}:${this.apiKey ?? ''}`,
    ).toString('base64')
    return {
      accessToken,
      extra: { username: this.username },
    }
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // API keys do not expire
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

  private client(credentials: Credentials): NutshellClient {
    return new NutshellClient(credentials)
  }

  private pageParams(params: QueryParams): { page: number; perPage: number } {
    return {
      page: Number(params['page'] ?? 0),
      perPage: Number(params['limit'] ?? params['perPage'] ?? 25),
    }
  }

  // ── Contacts ──────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const { page, perPage } = this.pageParams(params)
    const { items } = await this.client(credentials).list<RawNutshellContact>(
      'findContacts',
      {},
      page,
      perPage,
    )
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).call<RawNutshellContact>('getContact', {
      contactId: Number(id),
    })
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    const raw = await this.client(credentials).call<RawNutshellContact>('newContact', {
      contact: body,
    })
    return transformContact(raw)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const body = untransformContact(data)
    const raw = await this.client(credentials).call<RawNutshellContact>('editContact', {
      contactId: Number(id),
      contact: body,
      rev: 'HEAD',
    })
    return transformContact(raw)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).call<unknown>('deleteContact', {
      contactId: Number(id),
      rev: 'HEAD',
    })
  }

  // ── Companies (Accounts) ──────────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const { page, perPage } = this.pageParams(params)
    const { items } = await this.client(credentials).list<RawNutshellCompany>(
      'findAccounts',
      {},
      page,
      perPage,
    )
    return items.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const raw = await this.client(credentials).call<RawNutshellCompany>('getAccount', {
      accountId: Number(id),
    })
    return transformCompany(raw)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const body = untransformCompany(data)
    const raw = await this.client(credentials).call<RawNutshellCompany>('newAccount', {
      account: body,
    })
    return transformCompany(raw)
  }

  async updateCompany(
    credentials: Credentials,
    id: string,
    data: Partial<Company>,
  ): Promise<Company> {
    const body = untransformCompany(data)
    const raw = await this.client(credentials).call<RawNutshellCompany>('editAccount', {
      accountId: Number(id),
      account: body,
      rev: 'HEAD',
    })
    return transformCompany(raw)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).call<unknown>('deleteAccount', {
      accountId: Number(id),
      rev: 'HEAD',
    })
  }

  // ── Deals (Leads) ─────────────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const { page, perPage } = this.pageParams(params)
    const { items } = await this.client(credentials).list<RawNutshellDeal>(
      'findLeads',
      {},
      page,
      perPage,
    )
    return items.map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const raw = await this.client(credentials).call<RawNutshellDeal>('getLead', {
      leadId: Number(id),
    })
    return transformDeal(raw)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    const raw = await this.client(credentials).call<RawNutshellDeal>('newLead', {
      lead: body,
    })
    return transformDeal(raw)
  }

  async updateDeal(
    credentials: Credentials,
    id: string,
    data: Partial<Deal>,
  ): Promise<Deal> {
    const body = untransformDeal(data)
    const raw = await this.client(credentials).call<RawNutshellDeal>('editLead', {
      leadId: Number(id),
      lead: body,
      rev: 'HEAD',
    })
    return transformDeal(raw)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).call<unknown>('deleteLead', {
      leadId: Number(id),
      rev: 'HEAD',
    })
  }

  // ── Pipelines (Milestones) ────────────────────────────────────────────────

  async listPipelines(credentials: Credentials, _params: QueryParams): Promise<Pipeline[]> {
    const { items } = await this.client(credentials).list<RawNutshellMilestone>(
      'findMilestones',
      {},
    )
    if (items.length === 0) return []
    return [transformPipelineFromMilestones(items)]
  }

  // ── Activities (Tasks) ────────────────────────────────────────────────────

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const { page, perPage } = this.pageParams(params)
    const { items } = await this.client(credentials).list<RawNutshellActivity>(
      'findActivities',
      {},
      page,
      perPage,
    )
    return items.map(transformActivity)
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const raw = await this.client(credentials).call<RawNutshellActivity>('getActivity', {
      activityId: Number(id),
    })
    return transformActivity(raw)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const body = untransformActivity(data)
    const raw = await this.client(credentials).call<RawNutshellActivity>('newActivity', {
      activity: body,
    })
    return transformActivity(raw)
  }

  async updateActivity(
    credentials: Credentials,
    id: string,
    data: Partial<Activity>,
  ): Promise<Activity> {
    const body = untransformActivity(data)
    const raw = await this.client(credentials).call<RawNutshellActivity>('editActivity', {
      activityId: Number(id),
      activity: body,
      rev: 'HEAD',
    })
    return transformActivity(raw)
  }

  // Notes: not supported — registry returns 501 automatically
}
