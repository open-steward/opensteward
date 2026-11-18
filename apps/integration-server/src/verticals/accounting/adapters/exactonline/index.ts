import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Organization } from '../../schema/organization'

import { buildAuthUrl, exchangeCode, refreshAccessToken } from './auth'
import type { CredentialField } from '@opensteward/shared'
import { EXACT_DEFAULT_REGION, EXACT_REGION_LABELS, EXACT_REGIONS } from './constants'
import { ExactOnlineClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import { transformInvoice, type ExactInvoice } from './transform/invoice'
import { transformContact, type ExactContact } from './transform/contact'
import { transformAccount, type ExactAccount } from './transform/account'
import { transformOrganization, type ExactDivision } from './transform/organization'

interface ExactOnlineAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
  region?: string
}

interface ODataResult<T> {
  d: { results: T[] }
}

export class ExactOnlineAdapter implements AccountingAdapter {
  readonly platform = 'exactonline'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]
  /**
   * Deployment-wide fallback region. The admin UI cannot set it, so a Connect
   * Link customer picks their country site (`oauthFields`), which is then read
   * back from `credentials.extra.region`.
   */
  private region: string | undefined

  constructor(config: ExactOnlineAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes
    this.region = config.region
  }

  /** The customer's country site hosts the authorize, token and API endpoints. */
  oauthFields(): CredentialField[] {
    return [
      {
        name: 'region',
        label: 'Exact Online country',
        type: 'select',
        required: true,
        helpText: 'The Exact Online site you sign in to, e.g. start.exactonline.nl.',
        options: Object.keys(EXACT_REGIONS).map((value) => ({
          value,
          label: EXACT_REGION_LABELS[value] ?? value,
        })),
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
      this.clientId,
      this.redirectUri,
      overrideScopes ?? this.scopes,
      state,
      inputs?.['region'] ?? this.region,
    )
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return exchangeCode(code, this.clientId, this.clientSecret, redirectUri, this.region)
  }

  /** Exchange on the customer's country site; records region and division. */
  async exchangeCodeWithInputs(
    code: string,
    redirectUri: string,
    inputs: Record<string, string>,
  ): Promise<Credentials> {
    return exchangeCode(code, this.clientId, this.clientSecret, redirectUri, inputs['region'] ?? this.region)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken) throw new Error('No refresh token available')
    const region = this.storedRegion(credentials)
    const creds = await refreshAccessToken(credentials.refreshToken, this.clientId, this.clientSecret, region)
    creds.tenantId = credentials.tenantId
    creds.extra = { ...(credentials.extra ?? {}), region }
    return creds
  }

  /** Region recorded at connect time; older connections predate it and were all on the configured (or Dutch) site. */
  private storedRegion(credentials: Credentials): string {
    const stored = credentials.extra?.['region']
    return typeof stored === 'string' && stored.trim() ? stored : (this.region ?? EXACT_DEFAULT_REGION)
  }

  private client(credentials: Credentials): ExactOnlineClient {
    return new ExactOnlineClient(credentials, this.region)
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = this.client(credentials)
    const res = await client.get<ODataResult<ExactDivision>>('hrm/Divisions?$select=HID,Code,Description,Country,Currency')
    const div = res.d.results[0]
    return transformOrganization(div)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = this.client(credentials)
    const top = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 1000)
    const skip = ((params.page ?? 1) - 1) * top
    const filter = params.updatedAfter
      ? `&$filter=Modified gt DateTime'${params.updatedAfter.toISOString()}'`
      : ''
    const res = await client.get<ODataResult<ExactInvoice>>(
      `salesinvoice/SalesInvoices?$top=${top}&$skip=${skip}${filter}`,
    )
    return (res.d.results ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = this.client(credentials)
    const res = await client.get<ODataResult<ExactInvoice>>(
      `salesinvoice/SalesInvoices?$filter=InvoiceID eq guid'${id}'&$expand=SalesInvoiceLines`,
    )
    return transformInvoice(res.d.results[0])
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = this.client(credentials)
    const top = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 1000)
    const skip = ((params.page ?? 1) - 1) * top
    const res = await client.get<ODataResult<ExactContact>>(
      `crm/Accounts?$top=${top}&$skip=${skip}`,
    )
    return (res.d.results ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = this.client(credentials)
    const res = await client.get<ODataResult<ExactContact>>(
      `crm/Accounts?$filter=ID eq guid'${id}'`,
    )
    return transformContact(res.d.results[0])
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = this.client(credentials)
    const top = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 1000)
    const skip = ((params.page ?? 1) - 1) * top
    const res = await client.get<ODataResult<ExactAccount>>(
      `financial/GLAccounts?$top=${top}&$skip=${skip}`,
    )
    return (res.d.results ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = this.client(credentials)
    const res = await client.get<ODataResult<ExactAccount>>(
      `financial/GLAccounts?$filter=ID eq guid'${id}'`,
    )
    return transformAccount(res.d.results[0])
  }
}
