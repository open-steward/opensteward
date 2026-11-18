/**
 * UPayments adapter — payments vertical.
 *
 * Auth: API key as a Bearer token, plus an HMAC-SHA256 signature over every
 * request (X-Timestamp / X-Signature), signed with the API Secret Key
 * (https://developers.upayments.com/reference/hmac-authentication.md).
 * Host: https://uapi.upayments.com/api/v1 (go-live checklist).
 */

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: balance-transaction — no balance-transaction API; ledger entries are not exposed via REST
// Unavailable: customer           — only create-customer-unique-token / add-card / retrieve-customer-cards; no customer list or read
// Unavailable: dispute            — no dispute management API; chargebacks are handled outside the REST API
// Unavailable: invoice            — only a create-invoice endpoint exists; no list or get invoice endpoints
// Unavailable: payment-method     — retrieve-customer-cards requires a per-customer token; no global list endpoint
// Unavailable: payout             — no payout API; settlements are handled outside the REST API
// Unavailable: plan               — no subscription plan management API
// Unavailable: subscription       — auto-deduct is a one-shot charge trigger, not a subscription management API

import type { BaseAdapter, CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import { reportUpstreamPage } from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Customer } from '../../schema/customer'
import type { Refund } from '../../schema/refund'

import { buildCredentials, UPAYMENTS_CREDENTIAL_FIELDS } from './auth'
import { UpaymentsClient } from './client'

import {
  transformSalesRow,
  transformTransaction,
  type RawUpaymentsSalesRow,
  type RawUpaymentsTransaction,
} from './transform/charge'
import { transformRefund, type RawUpaymentsRefund } from './transform/refund'

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

/** GET /reports/sales response, as documented. */
interface SalesReportResponse {
  status?: boolean
  data?: {
    pagination?: {
      current_page?: number
      last_page?: number
      per_page?: number
      total?: number
    }
    report?: RawUpaymentsSalesRow[]
  }
}

export class UpaymentsAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'upayments'
  readonly version = '0.2.0'

  getAuthUrl(): string {
    throw new Error('UPayments uses an API key; submit it via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('UPayments uses an API key; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return UPAYMENTS_CREDENTIAL_FIELDS
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return buildCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  private client(credentials: Credentials): UpaymentsClient {
    return new UpaymentsClient(credentials)
  }

  /**
   * The documented customer operations are POST /create-customer-unique-token,
   * POST /add-card and POST /retrieve-customer-cards
   * (https://developers.upayments.com/llms.txt); none lists or reads customers.
   */
  async listCustomers(): Promise<Customer[]> {
    throw notSupported(
      'UPayments cannot list customers: its API documents only "Create Customer Unique Token", "Add Card" and "Retrieve Cards" (customer\'s cards from token), with no customer list endpoint.',
    )
  }

  async getCustomer(): Promise<Customer> {
    throw notSupported(
      'UPayments cannot read a customer: its API documents only "Create Customer Unique Token", "Add Card" and "Retrieve Cards" (customer\'s cards from token), with no customer read endpoint.',
    )
  }

  /**
   * GET /reports/sales (https://developers.upayments.com/reference/sales-report.md),
   * "page": "Page number for pagination (default: 1)." and "perPage": "Number
   * of records per page (default: 10)." No maximum is documented. The end
   * comes from data.pagination.current_page < last_page.
   */
  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    const page = Number(params.page ?? 1)
    const query: Record<string, unknown> = { page }
    if (params.limit !== undefined) query.perPage = Number(params.limit)
    const res = await this.client(credentials).get<SalesReportResponse>('reports/sales', query)
    const pagination = res.data?.pagination
    if (typeof pagination?.last_page === 'number') {
      const current = typeof pagination.current_page === 'number' ? pagination.current_page : page
      const served = pagination.per_page
      const asked = Number(params.limit)
      reportUpstreamPage(params, {
        hasMore: current < pagination.last_page,
        ...(typeof pagination.total === 'number' ? { totalCount: pagination.total } : {}),
        ...(typeof served === 'number' && Number.isInteger(served) && served >= 1 && served < asked
          ? { pageSize: served }
          : {}),
      })
    }
    return (res.data?.report ?? []).map(transformSalesRow)
  }

  /**
   * GET /get-payment-status/{track_id}
   * (https://developers.upayments.com/reference/checkpaymentstatus.md); the
   * charge id is the track_id listCharges returns.
   */
  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).get<{
      data?: { transaction?: RawUpaymentsTransaction }
    }>(`get-payment-status/${encodeURIComponent(id)}`)
    const tx = res.data?.transaction
    if (!tx) {
      throw Object.assign(new Error(`UPayments returned no transaction for track_id ${id}`), {
        statusCode: 404,
      })
    }
    return transformTransaction(tx)
  }

  /**
   * The documented refund endpoints are single-order: POST /create-refund,
   * POST /delete-refund and GET /check-refund/{order_id}
   * (https://developers.upayments.com/reference/checkrefund.md).
   */
  async listRefunds(): Promise<Refund[]> {
    throw notSupported(
      'UPayments cannot list refunds: its refund status API is "designed for checking the specific refund status of a transaction based on the orderId", with no refund list endpoint.',
    )
  }

  // Write method, out of scope of the list rebuild: POST refunds is not a
  // documented path (the documented one is POST create-refund).
  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    const res = await this.client(credentials).post<{ data?: RawUpaymentsRefund }>('refunds', {
      chargeId: data.chargeId,
      amount: data.amount,
    })
    return transformRefund(res.data ?? {})
  }
}
