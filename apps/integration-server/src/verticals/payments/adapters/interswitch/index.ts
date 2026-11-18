/**
 * Interswitch adapter — payments vertical.
 *
 * Quickteller Business / payment gateway: https://docs.interswitchgroup.com.
 *
 * Auth is the documented OAuth 2.0 client-credentials grant (see auth.ts); the
 * connection holds the client ID and secret key from the Quickteller Business
 * dashboard, and the token's `merchant_code` scopes every list.
 *
 * Coverage:
 * - listCharges → GET /paymentgateway/api/v1/transactions (date window
 *   required, so only served when the caller sends `updatedAfter`).
 * - Customers, refunds, payouts: refused (see each method for the quoted
 *   reason).
 */

import type { BaseAdapter, CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import { reportUpstreamPage } from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Customer } from '../../schema/customer'
import type { Charge } from '../../schema/charge'
import type { Refund } from '../../schema/refund'
import type { Payout } from '../../schema/payout'

import {
  exchangeCredentials as doExchange,
  readExtra,
  refreshCredentials as doRefresh,
} from './auth'
import { InterswitchClient } from './client'
import { DEFAULT_PAGE_SIZE, TRANSACTIONS_PATH } from './constants'
import { transformCharge, type RawInterswitchTransaction } from './transform/charge'

interface TransactionsPage {
  count: number
  content: RawInterswitchTransaction[]
}

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

/** MM/dd/yyyy on the UTC calendar ("Format: MM/dd/yyyy", get-transactions). */
function usDate(d: Date): string {
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  return `${mm}/${dd}/${d.getUTCFullYear()}`
}

export class InterswitchAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'interswitch'
  readonly version = '0.2.0'

  getAuthUrl(): string {
    throw new Error(
      'Interswitch uses the OAuth 2.0 client-credentials grant; submit the client ID and secret key via the Connect Link form.',
    )
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error(
      'Interswitch uses the client-credentials grant; call exchangeCredentials instead.',
    )
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'clientId',
        label: 'Client ID',
        type: 'text',
        required: true,
        helpText: 'Quickteller Business dashboard → Developer Tools.',
      },
      {
        name: 'secretKey',
        label: 'Secret key',
        type: 'password',
        required: true,
        helpText: 'Quickteller Business dashboard → Developer Tools.',
      },
    ]
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return doExchange(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  private client(credentials: Credentials): InterswitchClient {
    return new InterswitchClient(credentials)
  }

  // ── Customers ──────────────────────────────────────────────────────────────

  async listCustomers(): Promise<Customer[]> {
    throw notSupported(
      'Interswitch cannot list customers: the docs define no customer resource; a customer appears only as the "merchantCustomerId" filter ("the customer id for the transaction") on GET /paymentgateway/api/v1/transactions.',
    )
  }

  async getCustomer(): Promise<Customer> {
    throw notSupported(
      'Interswitch cannot read customers: the docs define no customer resource or customer lookup endpoint.',
    )
  }

  // ── Charges (payment-gateway transactions) ────────────────────────────────

  /**
   * GET /paymentgateway/api/v1/transactions requires `merchantCode`,
   * `startDate`, `endDate` ("start date of the date range. Format:
   * MM/dd/yyyy"), `pageSize` and `pageNum`, and answers `{ count, content }`.
   * No retention or lookback limit is documented, so an unfiltered call is
   * refused; with `updatedAfter` the window is [that UTC day, today UTC] and
   * the caller's page and limit go straight through as pageNum / pageSize.
   */
  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    const since = params.updatedAfter
    if (!(since instanceof Date)) {
      throw notSupported(
        'Interswitch cannot list charges without a date window: GET /paymentgateway/api/v1/transactions requires startDate and endDate ("start date of the date range. Format: MM/dd/yyyy") and documents no lookback limit; pass updatedAfter.',
      )
    }
    const { merchantCode } = readExtra(credentials)
    if (!merchantCode) {
      throw notSupported(
        "Interswitch cannot list charges: the connection has no merchantCode (taken from the Passport token's merchant_code). Reconnect with a client ID and secret key.",
      )
    }
    const page = params.page ?? 1
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    const res = await this.client(credentials).get<TransactionsPage>(TRANSACTIONS_PATH, {
      merchantCode,
      startDate: usDate(since),
      endDate: usDate(new Date()),
      pageNum: page,
      pageSize: limit,
    })
    if (!Array.isArray(res.content) || typeof res.count !== 'number') {
      throw new Error(
        'Interswitch transactions response is missing the documented { count, content } envelope.',
      )
    }
    reportUpstreamPage(params, {
      totalCount: res.count,
      hasMore: (page - 1) * limit + res.content.length < res.count,
    })
    return res.content.map(transformCharge)
  }

  /**
   * The documented single-transaction reads (GET /collections/api/v1/
   * gettransaction.json, which also requires the amount, and GET
   * /collections/api/v2/gettransaction.json by transactionReference) return no
   * currency, which the canonical Charge requires.
   */
  async getCharge(): Promise<Charge> {
    throw notSupported(
      'Interswitch cannot read a single charge: the documented lookups (gettransaction.json v1/v2) return no currency field, and the canonical Charge requires one.',
    )
  }

  // ── Refunds ────────────────────────────────────────────────────────────────

  async listRefunds(): Promise<Refund[]> {
    throw notSupported(
      'Interswitch cannot list refunds as canonical Refunds: GET /paymentgateway/api/v1/refunds ("Get refund by merchant code and date") returns id, refundReference, parentPaymentId, refundType, refundAmount, createdDate, refundStatus … but no currency, which the canonical Refund requires.',
    )
  }

  async getRefund(): Promise<Refund> {
    throw notSupported(
      'Interswitch cannot read refunds as canonical Refunds: the documented refund records carry no currency, which the canonical Refund requires.',
    )
  }

  // ── Payouts ────────────────────────────────────────────────────────────────

  async listPayouts(): Promise<Payout[]> {
    throw notSupported(
      'Interswitch cannot list payouts: the Payouts API documents only create, customer-lookup and "Retrieves a payout transaction by its reference." — no list endpoint.',
    )
  }

  async getPayout(): Promise<Payout> {
    throw notSupported(
      'Interswitch cannot read payouts here: the only documented read ("Retrieves a payout transaction by its reference.") is on the separate payouts.interswitchng.com wallet-disbursement API, not a merchant settlement payout.',
    )
  }
}
