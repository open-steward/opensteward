/**
 * eWAY adapter — payments vertical (Australia / New Zealand / Asia-Pacific).
 *
 * eWAY is a card-not-present and card-present gateway anchored in Australia,
 * New Zealand, Singapore, Malaysia and Hong Kong. This adapter wraps the
 * Rapid REST API (`api.ewaypayments.com`, sandbox `api.sandbox.ewaypayments.com`).
 *
 * Auth: HTTP Basic. The customer supplies their Rapid API key + API password
 * and picks the environment (sandbox / production); we base64-encode
 * `apiKey:password` into the `Authorization: Basic …` header and send
 * `X-EWAY-APIVERSION` on every request. There is no OAuth — separate hosts +
 * per-environment keys distinguish test from live.
 *
 * Supported canonical resources (only what the Rapid API actually exposes):
 *   - Charges  — create (ProcessPayment), get (Transaction query), capture
 *     (Authorise → capture), cancel (cancel an authorisation)
 *   - Refunds  — create (Transaction refund), get (Transaction query of the
 *     refund transaction)
 *   - Customers — get a single token customer by TokenCustomerID
 *
 * Rapid has NO list-with-cursor endpoint, so `listCharges` / `listRefunds` /
 * `listCustomers` are intentionally NOT implemented — the router auto-501s
 * them, along with subscriptions / invoices / payouts / disputes / plans, none
 * of which the Rapid transaction API covers.
 *
 * Webhooks: eWAY only offers an unsigned "Event Notification" callback URL
 * (no HMAC / signature to verify), so no `verifyWebhook` / `parseWebhookEvents`
 * is exposed — the router auto-501s those.
 *
 * Docs: https://eway.io/api-v3/
 */

// ── Resource coverage ──────────────────────────────────────────────
// Available:    charge, customer, refund
// Unavailable:  balance-transaction — no settlement ledger or balance-transaction endpoint in Rapid API
// Unavailable:  dispute             — no dispute/chargeback management endpoints; handled offline by eWAY support
// Unavailable:  invoice             — no Invoice object/endpoints; InvoiceReference is only a metadata field on transactions
// Unavailable:  payment-method      — no list/get/detach endpoint for stored cards; card details only via getCustomer
// Unavailable:  payout              — no payout or settlement disbursement endpoints in Rapid API
// Unavailable:  plan                — no plan/price/product endpoints; recurring billing is merchant-driven via TokenPayment
// Unavailable:  subscription        — no subscription management; recurring payments are ad-hoc TokenPayment calls

import type {
  BaseAdapter,
  CredentialField,
  Credentials,
} from '@opensteward/shared'
import { customForm } from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Customer } from '../../schema/customer'
import type { Refund } from '../../schema/refund'

import { buildCredentials } from './auth'
import { EwayClient } from './client'

import { transformCharge, type RawEwayPayment } from './transform/charge'
import { transformCustomer, type RawEwayCustomer } from './transform/customer'
import { transformRefund, type RawEwayRefund } from './transform/refund'

/** Shape of a `GET /Transaction/{id}` query response. */
interface EwayTransactionQuery {
  Transactions?: RawEwayPayment[] | null
  Errors?: string | null
}

const CREDENTIAL_FORM = customForm({
  fields: [
    {
      name: 'apiKey',
      label: 'API key',
      type: 'password',
      required: true,
      helpText: 'MYeWAY → My Account → Manage API Keys. The long Rapid API key.',
    },
    {
      name: 'password',
      label: 'API password',
      type: 'password',
      required: true,
      helpText: 'The API password shown alongside the API key in MYeWAY.',
    },
    {
      name: 'environment',
      label: 'Environment',
      type: 'select',
      required: true,
      options: [
        { value: 'sandbox', label: 'Sandbox' },
        { value: 'production', label: 'Production' },
      ],
      helpText: 'eWAY uses separate sandbox and production hosts + keys.',
    },
  ],
  exchange: async (fields) => buildCredentials(fields),
})

export class EwayAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'eway'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error(
      'eWAY uses HTTP Basic auth (API key + API password); submit them via the Connect Link form.',
    )
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('eWAY uses HTTP Basic auth; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return CREDENTIAL_FORM.credentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return CREDENTIAL_FORM.exchangeCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Basic credentials are long-lived; nothing to refresh.
    return credentials
  }

  private client(credentials: Credentials): EwayClient {
    return new EwayClient(credentials)
  }

  // ── Charges ────────────────────────────────────────────────────────────────

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).get<EwayTransactionQuery>(`/Transaction/${id}`)
    const tx = res.Transactions?.[0] ?? {}
    return transformCharge(tx)
  }

  async createCharge(credentials: Credentials, data: Partial<Charge>): Promise<Charge> {
    const res = await this.client(credentials).post<RawEwayPayment>('/Transaction', {
      Method: 'ProcessPayment',
      TransactionType: 'Purchase',
      Customer: data.customerId ? { TokenCustomerID: data.customerId } : undefined,
      Payment: {
        TotalAmount: data.amount ?? 0,
        CurrencyCode: data.currency,
        InvoiceReference: data.statementDescriptor,
        InvoiceDescription: data.description,
      },
    })
    return transformCharge(res)
  }

  /** Capture a previously-authorised (Authorise method) transaction. */
  async captureCharge(
    credentials: Credentials,
    id: string,
    data?: { amount?: number },
  ): Promise<Charge> {
    const res = await this.client(credentials).post<RawEwayPayment>('/CapturePayment', {
      Payment: {
        TotalAmount: data?.amount ?? 0,
      },
      TransactionId: id,
    })
    return transformCharge(res)
  }

  /** Cancel (void) an uncaptured authorisation. */
  async cancelCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).post<RawEwayPayment>('/CancelAuthorisation', {
      TransactionId: id,
    })
    return transformCharge(res)
  }

  // ── Refunds ─────────────────────────────────────────────────────────────────

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const res = await this.client(credentials).get<EwayTransactionQuery>(`/Transaction/${id}`)
    const tx = (res.Transactions?.[0] ?? {}) as RawEwayRefund
    return transformRefund(tx)
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.chargeId) throw new Error('chargeId is required for an eWAY refund.')
    const res = await this.client(credentials).post<RawEwayRefund>(
      `/Transaction/${data.chargeId}/Refund`,
      {
        Refund: {
          TotalAmount: data.amount ?? 0,
          CurrencyCode: data.currency,
          TransactionID: data.chargeId,
        },
      },
    )
    return transformRefund(res, data.chargeId)
  }

  // ── Customers (token customers) ──────────────────────────────────────────────

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const res = await this.client(credentials).get<EwayTransactionQuery & { Customers?: RawEwayCustomer[] }>(
      `/Customer/${id}`,
    )
    // A token-customer query comes back as a transaction-shaped envelope whose
    // first record carries the Customer block; some responses also expose a
    // `Customers[]` array. Accept either.
    const fromTransactions = res.Transactions?.[0]?.Customer ?? undefined
    const fromCustomers = res.Customers?.[0] ?? undefined
    return transformCustomer((fromCustomers ?? fromTransactions ?? {}) as RawEwayCustomer)
  }
}
