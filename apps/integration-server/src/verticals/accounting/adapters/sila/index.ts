import { simpleApiKey } from '@opensteward/shared'
import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Transaction } from '../../schema/transaction'
import type { Organization } from '../../schema/organization'

import { buildAuthUrl, exchangeCode, refreshCredentials } from './auth'
import { SilaClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformContact, type SilaUser } from './transform/contact'
import { transformAccount, type SilaWallet } from './transform/account'
import { transformTransaction, type SilaTransaction } from './transform/transaction'
import { transformOrganization, type SilaEntity } from './transform/organization'

interface SilaAdapterConfig {
  privateKey: string
  appHandle: string
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class SilaAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'sila'
  readonly version = '0.1.0'

  private readonly privateKey: string
  private readonly appHandle: string

  constructor(config: SilaAdapterConfig) {
    this.privateKey = config.privateKey
    this.appHandle = config.appHandle
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
    return {
      accessToken: this.privateKey,
      extra: { appHandle: this.appHandle },
    }
  }

  private paginationParams(params: QueryParams): Record<string, unknown> {
    return {
      page: params.page ?? 1,
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    }
  }

  // --- Organization ---

  async getOrganization(_credentials: Credentials): Promise<Organization> {
    const client = new SilaClient(this.credentialsFromConfig())
    const res = await client.post<SilaEntity>('get_entity', {})
    return transformOrganization(res)
  }

  // --- Contacts (registered users) ---

  async listContacts(_credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new SilaClient(this.credentialsFromConfig())
    const res = await client.post<{ users: SilaUser[] }>('get_accounts', this.paginationParams(params))
    return (res.users ?? []).map(transformContact)
  }

  // --- Accounts (wallets) ---

  async listAccounts(_credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new SilaClient(this.credentialsFromConfig())
    const res = await client.post<{ wallets: SilaWallet[] }>('get_wallets', this.paginationParams(params))
    return (res.wallets ?? []).map(transformAccount)
  }

  // --- Transactions ---

  async listTransactions(_credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new SilaClient(this.credentialsFromConfig())
    const res = await client.post<{ transactions: SilaTransaction[] }>('get_transactions', this.paginationParams(params))
    return (res.transactions ?? []).map(transformTransaction)
  }

  async getTransaction(_credentials: Credentials, id: string): Promise<Transaction> {
    const client = new SilaClient(this.credentialsFromConfig())
    const res = await client.post<{ transactions: SilaTransaction[] }>('get_transactions', {
      search_filters: { transaction_id: id },
    })
    const txn = res.transactions?.[0]
    if (!txn) throw new Error(`Transaction ${id} not found`)
    return transformTransaction(txn)
  }
}
