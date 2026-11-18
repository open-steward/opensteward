/**
 * EgestorAdapter — OpenSteward accounting adapter for eGestor (Brazil).
 *
 * Auth: api_key (personal_token).
 * The user obtains a personal_token from eGestor Settings → API tab.
 * That token is exchanged for a short-lived Bearer access_token via
 * POST /api/oauth/access_token (grant_type=personal). The personal_token
 * is stored as credentials.refreshToken for re-exchange.
 *
 * Base URL: https://api.egestor.com.br/api/v1/
 * Pagination: fixed 50 records per page, 1-based `page` query param.
 * Rate limit: 60 req/min per application+user.
 *
 * Supported resources:
 *   - Organization   (GET /empresa)
 *   - Contacts       (GET /contatos)
 *   - Invoices       (GET /vendas — sales)
 *   - Bills          (GET /compras — purchases)
 *   - Accounts       (GET /planoContas — chart of accounts)
 *   - Transactions   (GET /recebimentos + GET /pagamentos)
 *   - Expenses       (GET /pagamentos — disbursements)
 *   - CreditMemos    (GET /devolucoes — sales returns)
 *   - TaxRates       (GET /configTrib — tax groups)
 */

import { connectionScope, cursorPagerKey, customForm, pageByRows } from '@opensteward/shared'
import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Bill } from '../../schema/bill'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Transaction } from '../../schema/transaction'
import type { Expense } from '../../schema/expense'
import type { CreditMemo } from '../../schema/creditmemo'
import type { TaxRate } from '../../schema/taxrate'
import type { Organization } from '../../schema/organization'

import { buildAuthUrl, exchangeCode, refreshAccessToken } from './auth'
import { EgestorClient } from './client'
import { PAGE_SIZE } from './constants'

import { transformInvoice, untransformInvoice, type EgestorVenda } from './transform/invoice'
import { transformBill, type EgestorCompra } from './transform/bill'
import { transformContact, type EgestorContato } from './transform/contact'
import { transformAccount, type EgestorPlanoContas } from './transform/account'
import { transformTransaction, type EgestorRecebimento } from './transform/transaction'
import { transformExpense, type EgestorPagamentoExpense } from './transform/expense'
import { transformCreditMemo, type EgestorDevolucao } from './transform/creditmemo'
import { transformTaxRate, type EgestorConfigTrib } from './transform/taxrate'
import { transformOrganization, type EgestorEmpresa } from './transform/organization'
import { egestorWebhook } from './webhook'

/** eGestor paginated list envelope */
interface EgestorPage<T> {
  total: number
  per_page: number
  current_page: number
  last_page: number
  from: number
  to: number
  data: T[]
}

/**
 * Connect Link form for eGestor.
 *
 * The user pastes their personal_token from eGestor Settings → API tab.
 * `exchangeCredentials` immediately exchanges it for a short-lived Bearer
 * access_token via POST /api/oauth/access_token (grant_type=personal) and
 * stores the personal_token as `credentials.refreshToken` so that
 * `refreshCredentials()` can re-exchange it when the token expires.
 */
const EGESTOR_FORM = customForm({
  fields: [
    {
      name: 'personalToken',
      label: 'Personal token',
      type: 'password',
      placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      helpText:
        'Find your personal token in eGestor under Configurações → API.',
      required: true,
    },
  ],
  async exchange(fields) {
    const personalToken = (fields['personalToken'] ?? '').trim()
    if (!personalToken) throw new Error('Personal token is required.')
    return exchangeCode(personalToken)
  },
})

export class EgestorAdapter implements AccountingAdapter {
  readonly platform = 'egestor'
  readonly version = '0.1.0'

  // Connect Link support — personal_token form that exchanges for Bearer token
  credentialFields = EGESTOR_FORM.credentialFields
  exchangeCredentials = EGESTOR_FORM.exchangeCredentials

  // Webhook support
  verifyWebhook = egestorWebhook.verifyWebhook.bind(egestorWebhook)
  parseWebhookEvents = egestorWebhook.parseWebhookEvents.bind(egestorWebhook)

  getAuthUrl(_state: string): string {
    return buildAuthUrl(_state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // `code` is the personal_token pasted by the user
    return exchangeCode(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Re-exchange the stored personal_token for a fresh access_token
    const personalToken = credentials.refreshToken
    if (!personalToken) throw new Error('No personal_token stored; cannot refresh')
    return refreshAccessToken(personalToken)
  }

  private paginationParams(params: QueryParams): Record<string, unknown> {
    return {
      page: params.page ?? 1,
      ...(params.updatedAfter && {
        updatedAfter: params.updatedAfter.toISOString().split('T')[0],
      }),
    }
  }

  // ── Organization ──────────────────────────────────────────────────────────

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new EgestorClient(credentials)
    const raw = await client.get<EgestorEmpresa>('empresa')
    return transformOrganization(raw)
  }

  // ── Invoices (Vendas / Sales) ─────────────────────────────────────────────

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new EgestorClient(credentials)
    const res = await client.get<EgestorPage<EgestorVenda>>('vendas', {
      ...this.paginationParams(params),
    })
    return (res.data ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new EgestorClient(credentials)
    const raw = await client.get<EgestorVenda>(`vendas/${id}`)
    return transformInvoice(raw)
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const client = new EgestorClient(credentials)
    const raw = await client.post<EgestorVenda>('vendas', untransformInvoice(data))
    return transformInvoice(raw)
  }

  // ── Bills (Compras / Purchases) ───────────────────────────────────────────

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new EgestorClient(credentials)
    const res = await client.get<EgestorPage<EgestorCompra>>('compras', {
      ...this.paginationParams(params),
    })
    return (res.data ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new EgestorClient(credentials)
    const raw = await client.get<EgestorCompra>(`compras/${id}`)
    return transformBill(raw)
  }

  // ── Contacts ──────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new EgestorClient(credentials)
    const res = await client.get<EgestorPage<EgestorContato>>('contatos', {
      ...this.paginationParams(params),
    })
    return (res.data ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new EgestorClient(credentials)
    const raw = await client.get<EgestorContato>(`contatos/${id}`)
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new EgestorClient(credentials)
    const tipo: string[] = []
    if (data.isCustomer !== false) tipo.push('cliente')
    if (data.isSupplier) tipo.push('fornecedor')

    const raw = await client.post<EgestorContato>('contatos', {
      nome: data.companyName ?? data.name,
      fantasia: data.name,
      tipo,
      cpfcnpj: data.identification,
      emails: data.emails?.map((e) => e.email),
      fones: data.telephones?.map((t) => t.telephone),
      logradouro: data.billingAddress?.address1,
      bairro: data.billingAddress?.address2,
      cidade: data.billingAddress?.city,
      uf: data.billingAddress?.region,
      cep: data.billingAddress?.postalCode,
    })
    return transformContact(raw)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const client = new EgestorClient(credentials)
    const raw = await client.put<EgestorContato>(`contatos/${id}`, {
      nome: data.companyName ?? data.name,
      fantasia: data.name,
      emails: data.emails?.map((e) => e.email),
      fones: data.telephones?.map((t) => t.telephone),
      logradouro: data.billingAddress?.address1,
      bairro: data.billingAddress?.address2,
      cidade: data.billingAddress?.city,
      uf: data.billingAddress?.region,
      cep: data.billingAddress?.postalCode,
    })
    return transformContact(raw)
  }

  // ── Accounts (Plano de Contas) ────────────────────────────────────────────

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new EgestorClient(credentials)
    const res = await client.get<EgestorPage<EgestorPlanoContas>>('planoContas', {
      ...this.paginationParams(params),
    })
    return (res.data ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new EgestorClient(credentials)
    const raw = await client.get<EgestorPlanoContas>(`planoContas/${id}`)
    return transformAccount(raw)
  }

  // ── Transactions (Recebimentos = receivables, Pagamentos = payables) ───────

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new EgestorClient(credentials)
    const pag = this.paginationParams(params)
    const [recRes, pagRes] = await Promise.all([
      client.get<EgestorPage<EgestorRecebimento>>('recebimentos', pag),
      client.get<EgestorPage<EgestorRecebimento>>('pagamentos', pag),
    ])
    const receivables = (recRes.data ?? []).map((r) => transformTransaction(r, 'credit'))
    const payables = (pagRes.data ?? []).map((r) => transformTransaction(r, 'debit'))
    return [...receivables, ...payables]
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    // id is prefixed: "rec_<n>" for recebimentos, "pag_<n>" for pagamentos
    const client = new EgestorClient(credentials)
    if (id.startsWith('pag_')) {
      const raw = await client.get<EgestorRecebimento>(`pagamentos/${id.slice(4)}`)
      return transformTransaction(raw, 'debit')
    }
    const realId = id.startsWith('rec_') ? id.slice(4) : id
    const raw = await client.get<EgestorRecebimento>(`recebimentos/${realId}`)
    return transformTransaction(raw, 'credit')
  }

  // ── Tax Rates (ConfigTrib) ────────────────────────────────────────────────

  /**
   * GET /configTrib is a `listar` action: fixed 50-row pages ("Não é possível
   * alterar este número") chosen by a 1-based `page`, with no size parameter.
   * One upstream page is one caller page only at limit 50, so `pageByRows`
   * cuts rows [(page-1)×limit, page×limit) out of the 50-row pages and
   * reports `hasMore` itself. This used to send no query at all: every caller
   * page was the first 50 tax groups.
   *
   * The end is `last_page`. Every documented example sets `next_page_url:
   * null`, even beside `last_page: 4`, and the configTrib example's `total: 1`
   * contradicts its own `last_page: 4` and `to: 50`. Neither is read, and no
   * total is reported.
   *
   * Keyed by the connection (the personal token's fingerprint) and the fixed
   * upstream page size, not the caller's limit: walks at every limit share
   * one set of positions.
   */
  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new EgestorClient(credentials)
    const key = cursorPagerKey(connectionScope('egestor', credentials), 'configTrib', {
      pageSize: PAGE_SIZE,
    })
    const { items } = await pageByRows<TaxRate, number>(key, params, async (cursor) => {
      const page = cursor ?? 1
      const res = await client.get<EgestorPage<EgestorConfigTrib>>('configTrib', { page })
      return {
        items: (res.data ?? []).map(transformTaxRate),
        next: page < Number(res.last_page) ? page + 1 : undefined,
      }
    })
    return items
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new EgestorClient(credentials)
    const raw = await client.get<EgestorConfigTrib>(`configTrib/${id}`)
    return transformTaxRate(raw)
  }

  // ── Expenses (Pagamentos as disbursements) ────────────────────────────────

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new EgestorClient(credentials)
    const res = await client.get<EgestorPage<EgestorPagamentoExpense>>('pagamentos', {
      ...this.paginationParams(params),
    })
    return (res.data ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new EgestorClient(credentials)
    const raw = await client.get<EgestorPagamentoExpense>(`pagamentos/${id}`)
    return transformExpense(raw)
  }

  // ── Credit Memos (Devolucoes / Sales Returns) ─────────────────────────────

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new EgestorClient(credentials)
    const res = await client.get<EgestorPage<EgestorDevolucao>>('devolucoes', {
      ...this.paginationParams(params),
    })
    return (res.data ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new EgestorClient(credentials)
    const raw = await client.get<EgestorDevolucao>(`devolucoes/${id}`)
    return transformCreditMemo(raw)
  }
}
