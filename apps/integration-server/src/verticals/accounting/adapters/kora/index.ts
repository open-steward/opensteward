import { simpleApiKey } from '@opensteward/shared'
import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Contact } from '../../schema/contact'
import type { Transaction } from '../../schema/transaction'
import type { Organization } from '../../schema/organization'

import { buildAuthUrl, exchangeCode, refreshCredentials } from './auth'
import { KoraClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformContact, type KoraCustomer } from './transform/contact'
import { transformTransaction, type KoraTransaction } from './transform/transaction'
import { transformOrganization, type KoraBusiness } from './transform/organization'

interface KoraAdapterConfig {
  apiKey: string
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class KoraAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'kora'
  readonly version = '0.1.0'

  private readonly apiKey: string

  constructor(config: KoraAdapterConfig) {
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
      page: params.page ?? 1,
      limit: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    }
  }

  // --- Organization ---

  async getOrganization(_credentials: Credentials): Promise<Organization> {
    const client = new KoraClient(this.credentialsFromConfig())
    const res = await client.get<{ data: KoraBusiness }>('business')
    return transformOrganization(res.data ?? res)
  }

  // --- Contacts (customers) ---

  async listContacts(_credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new KoraClient(this.credentialsFromConfig())
    const res = await client.get<{ data: KoraCustomer[] }>('customers', this.paginationParams(params))
    return (res.data ?? []).map(transformContact)
  }

  async getContact(_credentials: Credentials, id: string): Promise<Contact> {
    const client = new KoraClient(this.credentialsFromConfig())
    const res = await client.get<{ data: KoraCustomer }>(`customers/${id}`)
    return transformContact(res.data ?? res)
  }

  // --- Transactions (payments) ---

  async listTransactions(_credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new KoraClient(this.credentialsFromConfig())
    const res = await client.get<{ data: KoraTransaction[] }>('transactions', this.paginationParams(params))
    return (res.data ?? []).map(transformTransaction)
  }

  async getTransaction(_credentials: Credentials, id: string): Promise<Transaction> {
    const client = new KoraClient(this.credentialsFromConfig())
    const res = await client.get<{ data: KoraTransaction }>(`transactions/${id}`)
    return transformTransaction(res.data ?? res)
  }
}
