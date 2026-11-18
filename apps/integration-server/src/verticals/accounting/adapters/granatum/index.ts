/**
 * GranatumAdapter — accounting adapter for Granatum Financeiro.
 *
 * Auth: static API key passed as `access_token` query param on every request.
 * Credentials.accessToken holds the key; no OAuth flow, no token refresh.
 * The Connect Link hosted page collects the API key via credentialFields /
 * exchangeCredentials (simpleApiKey helper).
 *
 * Resource mapping:
 *   lancamentos (tipo R/LR/RA)  → Invoice (receivables)
 *   lancamentos (tipo P/LP/PA)  → Bill (payables)
 *   lancamentos (all)           → Transaction
 *   clientes + fornecedores     → Contact
 *   contas                      → Account (bank accounts)
 *
 * Resources NOT supported by Granatum's API:
 *   Organization, Journal, TaxRate, Expense, CreditMemo,
 *   Order, SalesOrder, PurchaseOrder
 *   (these methods are omitted; the adapter framework returns 501 automatically)
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: creditmemo     — Granatum API has no credit memo endpoint (confirmed from official docs)
 * Unavailable: expense        — No separate expense resource; payable lancamentos map to bill
 * Unavailable: journal        — Granatum API has no double-entry journal endpoint (confirmed from official docs)
 * Unavailable: order          — Granatum API has no order/pedido endpoint (confirmed from official docs)
 * Unavailable: organization   — Granatum API has no organization/empresa endpoint (confirmed from official docs)
 * Unavailable: purchaseorder  — Granatum API has no purchase order endpoint (confirmed from official docs)
 * Unavailable: salesorder     — Granatum API has no sales order endpoint (confirmed from official docs)
 * Unavailable: taxrate        — Granatum API has no tax rate/alíquota endpoint (confirmed from official docs)
 */
import { simpleApiKey } from '@opensteward/shared'
import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Bill } from '../../schema/bill'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Transaction } from '../../schema/transaction'

import { getAuthUrl, exchangeCode as doExchangeCode, refreshCredentials as doRefreshCredentials } from './auth'
import { GranatumClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, untransformInvoice, type GranatumLancamento } from './transform/invoice'
import { transformBill } from './transform/bill'
import { transformContact, type GranatumPessoa } from './transform/contact'
import { transformAccount, type GranatumConta } from './transform/account'
import { transformTransaction } from './transform/transaction'

const SIMPLE_API_KEY_FORM = simpleApiKey({
  label: 'API key',
  helpText: 'Found in Granatum: Settings → Minha Empresa → API.',
})

export class GranatumAdapter implements AccountingAdapter {
  // Connect Link support — single API-key form.
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'granatum'
  readonly version = '0.1.0'

  /**
   * Granatum uses a static API key — no OAuth redirect URL exists.
   * Returns '#' to satisfy BaseAdapter without throwing.
   */
  getAuthUrl(state: string): string {
    return getAuthUrl(state)
  }

  /**
   * No OAuth code exchange. The Connect Link flow uses exchangeCredentials
   * instead. This is a no-op passthrough to satisfy BaseAdapter.
   */
  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return doExchangeCode(code)
  }

  /**
   * API keys do not expire — return credentials unchanged.
   */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefreshCredentials(credentials)
  }

  private paginationParams(params: QueryParams): Record<string, unknown> {
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const page = params.page ?? 1
    const start = (page - 1) * limit
    const result: Record<string, unknown> = { limit, start }
    if (params.updatedAfter) {
      result['modificado_apos'] = params.updatedAfter.toISOString()
    }
    return result
  }

  // --- Invoices (receitas / receivables) ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new GranatumClient(credentials)
    const items = await client.get<GranatumLancamento[]>('lancamentos', {
      ...this.paginationParams(params),
      tipo: 'R',  // receivables (receitas)
    })
    return (items ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new GranatumClient(credentials)
    const item = await client.get<GranatumLancamento>(`lancamentos/${id}`)
    return transformInvoice(item)
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const client = new GranatumClient(credentials)
    const body = untransformInvoice(data)
    const item = await client.post<GranatumLancamento>('lancamentos', body as Record<string, unknown>)
    return transformInvoice(item)
  }

  async updateInvoice(
    credentials: Credentials,
    id: string,
    data: Partial<Invoice>,
  ): Promise<Invoice> {
    const client = new GranatumClient(credentials)
    const body = untransformInvoice(data)
    const item = await client.put<GranatumLancamento>(`lancamentos/${id}`, body as Record<string, unknown>)
    return transformInvoice(item)
  }

  // --- Bills (despesas / payables) ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new GranatumClient(credentials)
    const items = await client.get<GranatumLancamento[]>('lancamentos', {
      ...this.paginationParams(params),
      tipo: 'P',  // payables (despesas)
    })
    return (items ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new GranatumClient(credentials)
    const item = await client.get<GranatumLancamento>(`lancamentos/${id}`)
    return transformBill(item)
  }

  // --- Contacts (clientes + fornecedores) ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new GranatumClient(credentials)
    const pag = this.paginationParams(params)
    const [clientItems, supplierItems] = await Promise.all([
      client.get<GranatumPessoa[]>('clientes', pag),
      client.get<GranatumPessoa[]>('fornecedores', pag),
    ])
    // Merge and deduplicate by id (a record can appear in both endpoints)
    const seen = new Set<string>()
    const all: Contact[] = []
    for (const raw of [...(clientItems ?? []), ...(supplierItems ?? [])]) {
      const key = String(raw.id)
      if (!seen.has(key)) {
        seen.add(key)
        all.push(transformContact(raw))
      }
    }
    return all
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new GranatumClient(credentials)
    // Try clientes first; fall back to fornecedores
    try {
      const raw = await client.get<GranatumPessoa>(`clientes/${id}`)
      return transformContact(raw)
    } catch {
      const raw = await client.get<GranatumPessoa>(`fornecedores/${id}`)
      return transformContact(raw)
    }
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new GranatumClient(credentials)
    const body: Record<string, unknown> = {
      nome: data.companyName ?? data.name,
      email: data.emails?.[0]?.email,
      telefone: data.telephones?.find((t) => t.type === 'WORK')?.telephone,
      documento: data.identification,
      endereco: data.billingAddress?.address1,
      cep: data.billingAddress?.postalCode,
    }
    // Route to clientes or fornecedores endpoint based on flags
    const endpoint = data.isSupplier && !data.isCustomer ? 'fornecedores' : 'clientes'
    const raw = await client.post<GranatumPessoa>(endpoint, body)
    return transformContact(raw)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const client = new GranatumClient(credentials)
    const body: Record<string, unknown> = {
      nome: data.companyName ?? data.name,
      email: data.emails?.[0]?.email,
      telefone: data.telephones?.find((t) => t.type === 'WORK')?.telephone,
      documento: data.identification,
    }
    // Try clientes first; fall back to fornecedores
    try {
      const raw = await client.put<GranatumPessoa>(`clientes/${id}`, body)
      return transformContact(raw)
    } catch {
      const raw = await client.put<GranatumPessoa>(`fornecedores/${id}`, body)
      return transformContact(raw)
    }
  }

  // --- Accounts (bank/cash accounts — contas) ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new GranatumClient(credentials)
    const items = await client.get<GranatumConta[]>('contas', this.paginationParams(params))
    return (items ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new GranatumClient(credentials)
    const item = await client.get<GranatumConta>(`contas/${id}`)
    return transformAccount(item)
  }

  // --- Transactions (all lancamentos) ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new GranatumClient(credentials)
    const items = await client.get<GranatumLancamento[]>('lancamentos', this.paginationParams(params))
    return (items ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new GranatumClient(credentials)
    const item = await client.get<GranatumLancamento>(`lancamentos/${id}`)
    return transformTransaction(item)
  }
}
