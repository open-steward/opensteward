import { simpleApiKey } from '@opensteward/shared'
import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Transaction } from '../../schema/transaction'
import type { Organization } from '../../schema/organization'

import { buildAuthUrl, exchangeCode, refreshCredentials } from './auth'
import { PagaClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformContact, type PagaCustomer } from './transform/contact'
import { transformAccount, type PagaAccount } from './transform/account'
import { transformTransaction, type PagaTransaction } from './transform/transaction'
import { transformOrganization, type PagaBusiness } from './transform/organization'

interface PagaAdapterConfig {
  apiKey: string
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class PagaAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'paga'
  readonly version = '0.1.0'

  private readonly apiKey: string

  constructor(config: PagaAdapterConfig) {
    this.apiKey = config.apiKey
  }

  getAuthUrl(_state: string): string {
    return buildAuthUrl(_state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return exchangeCode(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshCredentials(credentials)
  }

  private credentialsFromConfig(): Credentials {
    return { accessToken: this.apiKey }
  }

  private paginationParams(params: QueryParams): Record<string, unknown> {
    return {
      pageNumber: params.page ?? 0,
      pageSize: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    }
  }

  // --- Organization ---

  async getOrganization(_credentials: Credentials): Promise<Organization> {
    const client = new PagaClient(this.credentialsFromConfig())
    const raw = await client.get<PagaBusiness>('merchant/getBusinessDetails')
    return transformOrganization(raw)
  }

  // --- Contacts (customers) ---

  async listContacts(_credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new PagaClient(this.credentialsFromConfig())
    const res = await client.get<{ customers: PagaCustomer[] }>('merchant/getCustomers', this.paginationParams(params))
    return (res.customers ?? []).map(transformContact)
  }

  // --- Accounts (wallets) ---

  async listAccounts(_credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new PagaClient(this.credentialsFromConfig())
    const res = await client.get<{ accounts: PagaAccount[] }>('merchant/getAccounts', this.paginationParams(params))
    return (res.accounts ?? []).map(transformAccount)
  }

  // --- Transactions ---

  async listTransactions(_credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new PagaClient(this.credentialsFromConfig())
    const res = await client.get<{ transactions: PagaTransaction[] }>(
      'merchant/getTransactions',
      this.paginationParams(params),
    )
    return (res.transactions ?? []).map(transformTransaction)
  }

  async getTransaction(_credentials: Credentials, id: string): Promise<Transaction> {
    const client = new PagaClient(this.credentialsFromConfig())
    const res = await client.get<PagaTransaction>(`merchant/getTransactionDetails/${id}`)
    return transformTransaction(res)
  }
}
