/**
 * Dynamics 365 CRM adapter for the CRM vertical.
 *
 * Maps the Microsoft Dataverse Web API (OData v4, v9.2) to canonical CRM
 * resources. Auth is OAuth2 via Azure AD (Microsoft Identity Platform); the
 * instance URL and tenant ID are stored in `credentials.extra` and used for
 * every subsequent API call.
 *
 * Docs: https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/
 *
 * Resources implemented:
 *   - Contacts     (contacts entity)
 *   - Companies    (accounts entity)
 *   - Deals        (opportunities entity)
 *   - Pipelines    (read-only; synthesised from standard D365 stages)
 *   - Activities   (tasks entity)
 *   - Notes        (annotations entity)
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { WebhookEvent } from '../../schema/webhook'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'

import type { CredentialField } from '@opensteward/shared'
import { Dynamics365Client } from './client'
import * as Auth from './auth'
import { verifyWebhook, parseWebhookEvents } from './webhook'

import {
  transformContact, untransformContact, type RawDynamicsContact,
} from './transform/contact'
import {
  transformCompany, untransformCompany, type RawDynamicsAccount,
} from './transform/company'
import {
  transformDeal, untransformDeal, type RawDynamicsOpportunity,
} from './transform/deal'
import { transformPipeline } from './transform/pipeline'
import {
  transformActivity, untransformActivity, type RawDynamicsTask,
} from './transform/activity'
import {
  transformNote, untransformNote, type RawDynamicsAnnotation,
} from './transform/note'

export interface Dynamics365CrmAdapterConfig {
  /** Azure AD application (client) ID. */
  clientId?: string
  /** Azure AD client secret. */
  clientSecret?: string
  /** OAuth2 redirect URI. */
  redirectUri?: string
  /**
   * Azure AD tenant ID. Falls back to 'common' for multi-tenant apps.
   * Overridden at runtime by `credentials.extra.tenantId` when available.
   */
  tenantId?: string
  /**
   * Dynamics 365 instance URL (e.g. https://org.crm.dynamics.com).
   * Overridden at runtime by `credentials.extra.instanceUrl` when available.
   */
  instanceUrl?: string
}

const CONTACT_SELECT =
  '$select=contactid,firstname,lastname,emailaddress1,telephone1,jobtitle,_parentcustomerid_value,_ownerid_value,createdon,modifiedon'
const ACCOUNT_SELECT =
  '$select=accountid,name,websiteurl,telephone1,description,_ownerid_value,createdon,modifiedon'
const OPPORTUNITY_SELECT =
  '$select=opportunityid,name,estimatedvalue,closedateestimated,actualclosedate,salesstagecode,_parentaccountid_value,_parentcontactid_value,_ownerid_value,closeprobability,createdon,modifiedon'
const TASK_SELECT =
  '$select=activityid,subject,description,scheduledend,statecode,_ownerid_value,_regardingobjectid_value,createdon,modifiedon'
const ANNOTATION_SELECT =
  '$select=annotationid,subject,notetext,_objectid_value,objecttypecode,_ownerid_value,createdon,modifiedon'

export class Dynamics365CrmAdapter implements CrmAdapter {
  readonly platform = 'dynamics365-crm'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private tenantId: string
  /** Deployment-wide fallback. Per-customer environments arrive via `oauthFields`. */
  private instanceUrl: string | undefined

  constructor(config: Dynamics365CrmAdapterConfig = {}) {
    this.clientId = config.clientId ?? ''
    this.clientSecret = config.clientSecret ?? ''
    this.redirectUri = config.redirectUri ?? ''
    this.tenantId = config.tenantId ?? 'common'
    this.instanceUrl = config.instanceUrl
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  /**
   * The customer's Dataverse environment is part of the authorize request
   * itself (the token audience in `scope`), so it cannot come from the token
   * response and deployment config cannot know it. Asked for on the Connect
   * page before the redirect, then read back from `credentials.extra.instanceUrl`.
   */
  oauthFields(): CredentialField[] {
    return [
      {
        name: 'instanceUrl',
        label: 'Dynamics 365 environment URL',
        type: 'url',
        required: true,
        placeholder: 'https://yourorg.crm.dynamics.com',
        helpText: 'The address of your Dynamics 365 / Dataverse environment, as shown in the Power Platform admin center.',
      },
    ]
  }

  getAuthUrl(
    state: string,
    _overrideScopes?: string[],
    _codeChallenge?: string,
    inputs?: Record<string, string>,
  ): string {
    return Auth.getAuthUrl(
      this.clientId,
      this.redirectUri,
      state,
      this.tenantId,
      this.resolveInstanceUrl(inputs?.instanceUrl),
    )
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return Auth.exchangeCode(
      code,
      this.clientId,
      this.clientSecret,
      redirectUri,
      this.tenantId,
      this.resolveInstanceUrl(),
    )
  }

  /** Exchange for a token scoped to the customer's environment and remember it. */
  async exchangeCodeWithInputs(
    code: string,
    redirectUri: string,
    inputs: Record<string, string>,
  ): Promise<Credentials> {
    return Auth.exchangeCode(
      code,
      this.clientId,
      this.clientSecret,
      redirectUri,
      this.tenantId,
      this.resolveInstanceUrl(inputs.instanceUrl),
    )
  }

  /** The customer's environment when supplied, else the deployment-wide one — normalised or a readable error. */
  private resolveInstanceUrl(candidate?: string): string {
    return Auth.normaliseInstanceUrl(candidate ?? this.instanceUrl)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return Auth.refreshCredentials(credentials, this.clientId, this.clientSecret)
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseWebhookEvents(payload)
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private client(credentials: Credentials): Dynamics365Client {
    return new Dynamics365Client(credentials)
  }

  private pageParams(params: QueryParams): Record<string, string | number> {
    const limit = typeof params['limit'] === 'number' ? params['limit'] : 25
    const offset = typeof params['offset'] === 'number' ? params['offset'] : 0
    return { $top: limit, $skip: offset }
  }

  // ── Contacts ───────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const pageP = this.pageParams(params)
    const { items } = await this.client(credentials).list<RawDynamicsContact>('contacts', {
      ...pageP,
      [CONTACT_SELECT.split('=')[0]!]: CONTACT_SELECT.split('=').slice(1).join('='),
    })
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).get<RawDynamicsContact>('contacts', id)
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const raw = await this.client(credentials).post<RawDynamicsContact>(
      'contacts',
      untransformContact(data),
    )
    return transformContact(raw)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const raw = await this.client(credentials).patch<RawDynamicsContact>(
      'contacts',
      id,
      untransformContact(data),
    )
    return transformContact(raw)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete('contacts', id)
  }

  // ── Companies (Accounts) ──────────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const pageP = this.pageParams(params)
    const { items } = await this.client(credentials).list<RawDynamicsAccount>('accounts', {
      ...pageP,
      [ACCOUNT_SELECT.split('=')[0]!]: ACCOUNT_SELECT.split('=').slice(1).join('='),
    })
    return items.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const raw = await this.client(credentials).get<RawDynamicsAccount>('accounts', id)
    return transformCompany(raw)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const raw = await this.client(credentials).post<RawDynamicsAccount>(
      'accounts',
      untransformCompany(data),
    )
    return transformCompany(raw)
  }

  async updateCompany(
    credentials: Credentials,
    id: string,
    data: Partial<Company>,
  ): Promise<Company> {
    const raw = await this.client(credentials).patch<RawDynamicsAccount>(
      'accounts',
      id,
      untransformCompany(data),
    )
    return transformCompany(raw)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete('accounts', id)
  }

  // ── Deals (Opportunities) ─────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const pageP = this.pageParams(params)
    const { items } = await this.client(credentials).list<RawDynamicsOpportunity>('opportunities', {
      ...pageP,
      [OPPORTUNITY_SELECT.split('=')[0]!]: OPPORTUNITY_SELECT.split('=').slice(1).join('='),
    })
    return items.map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const raw = await this.client(credentials).get<RawDynamicsOpportunity>('opportunities', id)
    return transformDeal(raw)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const raw = await this.client(credentials).post<RawDynamicsOpportunity>(
      'opportunities',
      untransformDeal(data),
    )
    return transformDeal(raw)
  }

  async updateDeal(
    credentials: Credentials,
    id: string,
    data: Partial<Deal>,
  ): Promise<Deal> {
    const raw = await this.client(credentials).patch<RawDynamicsOpportunity>(
      'opportunities',
      id,
      untransformDeal(data),
    )
    return transformDeal(raw)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete('opportunities', id)
  }

  // ── Pipelines ─────────────────────────────────────────────────────────────

  async listPipelines(_credentials: Credentials, _params: QueryParams): Promise<Pipeline[]> {
    return [transformPipeline()]
  }

  async getPipeline(_credentials: Credentials, _id: string): Promise<Pipeline> {
    return transformPipeline()
  }

  // ── Activities (Tasks) ────────────────────────────────────────────────────

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const pageP = this.pageParams(params)
    const { items } = await this.client(credentials).list<RawDynamicsTask>('tasks', {
      ...pageP,
      [TASK_SELECT.split('=')[0]!]: TASK_SELECT.split('=').slice(1).join('='),
    })
    return items.map(transformActivity)
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const raw = await this.client(credentials).get<RawDynamicsTask>('tasks', id)
    return transformActivity(raw)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const raw = await this.client(credentials).post<RawDynamicsTask>(
      'tasks',
      untransformActivity(data),
    )
    return transformActivity(raw)
  }

  async updateActivity(
    credentials: Credentials,
    id: string,
    data: Partial<Activity>,
  ): Promise<Activity> {
    const raw = await this.client(credentials).patch<RawDynamicsTask>(
      'tasks',
      id,
      untransformActivity(data),
    )
    return transformActivity(raw)
  }

  async deleteActivity(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete('tasks', id)
  }

  // ── Notes (Annotations) ───────────────────────────────────────────────────

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const pageP = this.pageParams(params)
    const { items } = await this.client(credentials).list<RawDynamicsAnnotation>('annotations', {
      ...pageP,
      [ANNOTATION_SELECT.split('=')[0]!]: ANNOTATION_SELECT.split('=').slice(1).join('='),
    })
    return items.map(transformNote)
  }

  async getNote(credentials: Credentials, id: string): Promise<Note> {
    const raw = await this.client(credentials).get<RawDynamicsAnnotation>('annotations', id)
    return transformNote(raw)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const raw = await this.client(credentials).post<RawDynamicsAnnotation>(
      'annotations',
      untransformNote(data),
    )
    return transformNote(raw)
  }

  async updateNote(
    credentials: Credentials,
    id: string,
    data: Partial<Note>,
  ): Promise<Note> {
    const raw = await this.client(credentials).patch<RawDynamicsAnnotation>(
      'annotations',
      id,
      untransformNote(data),
    )
    return transformNote(raw)
  }

  async deleteNote(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete('annotations', id)
  }
}
