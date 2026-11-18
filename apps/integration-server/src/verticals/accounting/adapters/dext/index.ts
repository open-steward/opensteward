/**
 * Dext Precision adapter.
 *
 * Dext Precision (https://precision.dext.com) is a practice management layer
 * that sits on top of accounting software (Xero, QuickBooks, Sage, etc.).
 * Its public REST API exposes client health scores, VAT details, bank
 * reconciliation status, and rolling activity statistics.
 *
 * Supported canonical resources:
 *   - getOrganization  — GET /clients/{clientId}
 *
 * All other accounting resources (invoices, bills, contacts, accounts, …) are
 * not exposed by the Dext Precision API and auto-501 via the AccountingAdapter
 * optional-method convention.
 *
 * Auth: static Bearer token (generated in Dext Practice settings).
 *   No OAuth2 authorization-code flow exists; credentialFields() + exchangeCredentials()
 *   implement the Connect Link token-entry form.
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Available:   organization — GET /clients/{clientId}
 * Unavailable: account      — no chart-of-accounts endpoint in the Dext Precision public API
 * Unavailable: bill         — no bill/payable-document endpoints; activity-stats has aggregate counts only
 * Unavailable: contact      — no contact/supplier/customer endpoints; platform is a practice-management layer
 * Unavailable: creditmemo   — no credit-memo or credit-note endpoints
 * Unavailable: expense      — no expense endpoints; Dext Prepare (separate product) has no public API
 * Unavailable: invoice      — no invoice endpoints; activity-stats has aggregate counts only
 * Unavailable: journal      — no journal-entry endpoints
 * Unavailable: order        — no order endpoints
 * Unavailable: purchaseorder — no purchase-order endpoints
 * Unavailable: salesorder   — no sales-order endpoints
 * Unavailable: taxrate      — no tax-rate endpoints
 * Unavailable: transaction  — no transaction endpoints; bank transaction counts in activity-stats only
 */

import { simpleApiKey } from '@opensteward/shared'
import type { AccountingAdapter, Credentials } from '../../adapter/interface'
import type { Organization } from '../../schema/organization'

import { buildAuthUrl, exchangeCode, refreshCredentials as refreshCreds } from './auth'
import { DextClient } from './client'

import { transformOrganization, type DextClientDetail } from './transform/organization'

const SIMPLE_API_KEY_FORM = simpleApiKey({
  label: 'Dext API token',
  helpText:
    'Generate your token in Dext Precision > Practice settings > Data Health > API tokens.',
  placeholder: 'Paste your Dext API token here',
})

export class DextAdapter implements AccountingAdapter {
  // Connect Link support — single API-token form.
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'dext'
  readonly version = '0.1.0'

  /**
   * Dext has no OAuth2 flow — returns the settings URL where users generate
   * a token.
   */
  getAuthUrl(_state: string): string {
    return buildAuthUrl(_state)
  }

  /**
   * Treats the authorization code as the raw API token entered by the user.
   */
  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return exchangeCode(code)
  }

  /**
   * Static tokens do not expire; return credentials unchanged.
   */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshCreds(credentials)
  }

  // --- Organization ---

  /**
   * Fetch a single Dext client record and map it to Organization.
   * The `credentials.tenantId` must be the Dext client ID (short alphanumeric
   * string from GET /clients[].id).
   */
  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new DextClient(credentials)
    const clientId = credentials.tenantId
    if (!clientId) {
      throw new Error(
        'Dext: tenantId must be set to the Dext client ID (from GET /clients[].id).',
      )
    }
    const raw = await client.get<DextClientDetail>(`clients/${clientId}`)
    return transformOrganization(raw)
  }
}
