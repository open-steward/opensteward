/**
 * SynderAdapter — OpenSteward adapter for the Synder Importer API.
 *
 * Synder (https://synder.com) is an accounting-automation platform that
 * syncs e-commerce and payment-gateway transactions into QuickBooks Online
 * or Xero.  Its public API is an import-pipeline API rather than a
 * traditional CRUD API:
 *
 *   • No direct endpoints for invoices, bills, contacts, accounts, etc.
 *   • Authentication: static Bearer token (API key), NOT OAuth2.
 *   • No webhooks (polling required).
 *
 * Canonical resource mapping:
 *   GET /account          → getOrganization  (Synder user account)
 *   GET /companies        → (used internally; connected QBO/Xero tenants)
 *   GET /companies/{id}/imports → listTransactions / getTransaction
 *
 * Docs: https://importer.synder.com/apidocs
 */

import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Organization } from '../../schema/organization'
import type { Transaction } from '../../schema/transaction'

import { SYNDER_CREDENTIAL_FORM, passthrough } from './auth'
import { SynderClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import {
  transformSynderAccount,
  transformSynderCompany,
  type SynderAccount,
  type SynderCompany,
} from './transform/organization'
import { transformImport, type SynderImport } from './transform/transaction'

// ── Resource coverage ──────────────────────────────────────────────────────────
// Available:   organization — GET /account + GET /companies
// Available:   transaction  — GET /companies/{id}/imports + GET /companies/{id}/imports/{id}
//
// Unavailable: account      — no read endpoint; accounts are import targets in QuickBooks/Xero only
// Unavailable: bill         — no read endpoint; bills are an import target entity type only
// Unavailable: contact      — no read endpoint; contacts are an import target entity type only
// Unavailable: creditmemo   — no read endpoint; credit memos are an import target entity type only
// Unavailable: expense      — no read endpoint; expenses are an import target entity type only
// Unavailable: invoice      — no read endpoint; invoices are an import target entity type only
// Unavailable: journal      — no read endpoint; journal entries are an import target entity type only
// Unavailable: order        — no order concept in the Synder Importer API
// Unavailable: purchaseorder — no read endpoint; purchase orders are an import target entity type only
// Unavailable: salesorder   — no sales order concept in the Synder Importer API
// Unavailable: taxrate      — no read endpoint; tax is managed inside the connected QBO/Xero tenant
//
// Rationale: The Synder Importer API (https://importer.synder.com/apidocs) is a
// write-only import pipeline. Its 18 endpoints upload CSV/XLSX files and track
// import jobs. There are no GET endpoints for reading accounting records back out;
// all accounting data lives inside the connected QuickBooks Online / Xero tenant.

// ── Config ────────────────────────────────────────────────────────────────────

/**
 * SynderAdapter has no OAuth2 client credentials.
 * It is instantiated with no config — credentials are collected at
 * connection time via the Connect Link form (simpleApiKey template).
 */
export class SynderAdapter implements AccountingAdapter {
  readonly platform = 'synder'
  readonly version = '0.1.0'

  // ── Connect Link form (API key auth) ────────────────────────────────────────

  credentialFields = SYNDER_CREDENTIAL_FORM.credentialFields.bind(SYNDER_CREDENTIAL_FORM)
  exchangeCredentials = SYNDER_CREDENTIAL_FORM.exchangeCredentials.bind(SYNDER_CREDENTIAL_FORM)

  // ── BaseAdapter auth stubs ──────────────────────────────────────────────────
  //
  // Synder does not use OAuth2. The methods below satisfy the BaseAdapter
  // interface. getAuthUrl() returns an empty string (never called for API-key
  // adapters). exchangeCode() is unreachable. refreshCredentials() is a no-op
  // because Synder API keys do not expire.

  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    return ''
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('SynderAdapter does not use OAuth2 authorization-code flow.')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Synder API keys are static and never expire.
    return passthrough(credentials)
  }

  // ── Organization ─────────────────────────────────────────────────────────────

  /**
   * Returns the Synder user account as the top-level Organization.
   * If the caller supplies a tenantId (companyId), returns that connected
   * accounting-system company instead.
   */
  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new SynderClient(credentials)
    if (credentials.tenantId) {
      // Fetch the specific connected company (QuickBooks / Xero tenant)
      const companies = await client.get<SynderCompany[]>('/companies')
      const company = companies.find((c) => c.id === credentials.tenantId)
      if (company) return transformSynderCompany(company)
    }
    // Fall back to the Synder account itself
    const account = await client.get<SynderAccount>('/account')
    return transformSynderAccount(account)
  }

  // ── Transactions (import jobs) ────────────────────────────────────────────────
  //
  // Synder's import jobs are the closest analogue to transactions: each job
  // represents a batch of records imported into the connected accounting system.
  // They are surfaced here so callers can audit what has been synced.

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new SynderClient(credentials)
    const companyId = credentials.tenantId
    if (!companyId) {
      throw new Error(
        'SynderAdapter.listTransactions requires credentials.tenantId (Synder companyId).',
      )
    }
    const page = params.page ?? 1
    const perPage = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 100)
    const res = await client.getPaginated<SynderImport>(
      `/companies/${companyId}/imports`,
      page,
      perPage,
    )
    return (res.data ?? []).map(transformImport)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new SynderClient(credentials)
    const companyId = credentials.tenantId
    if (!companyId) {
      throw new Error(
        'SynderAdapter.getTransaction requires credentials.tenantId (Synder companyId).',
      )
    }
    const raw = await client.get<SynderImport>(`/companies/${companyId}/imports/${id}`)
    return transformImport(raw)
  }
}
