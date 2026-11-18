/**
 * Paytm Payment Gateway (PG) adapter — payments vertical (India anchor).
 *
 * Paytm is order-centric and server-to-server, with no standalone Customers
 * API. Single-resource lookups are id-scoped:
 *   - `getCharge(id)`              → id is the merchant `orderId`.
 *   - `createRefund({ chargeId })` → chargeId is the `orderId`; metadata.txnId
 *                                    supplies the Paytm `txnId`.
 *   - `getRefund(id)`              → id is `"<orderId>:<refId>"`.
 *
 * `listCharges`/`listRefunds` page the merchant-passbook Order List / Refund
 * List APIs over a date window instead (default: the last 30 days, or since
 * `params.updatedAfter`) — see those methods below for the per-call auth and
 * envelope differences those two endpoints need from the rest of the client.
 *
 * Auth: per-request Paytm checksum (`head.signature`) over the request body,
 * keyed with the Merchant Key. The MID + environment ride in
 * `Credentials.extra`; there is no OAuth and no token refresh.
 *
 * Money: Paytm quotes MAJOR units (rupees, decimal strings); the canonical
 * schema is integer minor units (paise) — transforms scale by 100.
 */

// ── Resource coverage ──────────────────────────────────────────────────────
// Available:   charge, refund
// Unavailable: customer   — no standalone Customer API; custId is a merchant-assigned opaque string
// Unavailable: invoice    — no invoice concept; Paytm creates payment links, not structured invoices
// Unavailable: plan       — subscriptions are ad-hoc; no reusable plan catalog API
// Unverified:  balance-transaction — Settlement APIs use JWT Bearer auth (different from PG checksum client)
// Unverified:  payment-method     — Fetch Saved Cards requires SSO session token (different auth flow)
// Unverified:  payout             — Settlement Summary/Detail APIs use JWT Bearer auth (production-only)
// Unverified:  dispute            — Dispute Status API uses different base host (secure.paytmpayments.com) and envelope
// Unverified:  subscription       — Subscription APIs require AES/SSO token (different auth flow)

import { reportUpstreamPage } from '@opensteward/shared'
import type {
  BaseAdapter,
  CredentialField,
  Credentials,
  QueryParams,
} from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Refund } from '../../schema/refund'
import type { WebhookEvent } from '../../schema/webhook'

import {
  DEFAULT_ORDER_LIST_PAGE_SIZE,
  DEFAULT_REFUND_LIST_PAGE_SIZE,
  LIST_WINDOW_MS,
  MAX_REFUND_LIST_PAGE_SIZE,
  ORDER_LIST_PATH,
  REFUND_APPLY_PATH,
  REFUND_LIST_PATH,
  REFUND_STATUS_PATH,
  TXN_STATUS_PATH,
} from './constants'
import { buildCredentials } from './auth'
import { PaytmClient } from './client'
import { parsePaytmWebhookEvents, verifyPaytmWebhook } from './webhook'

import { transformCharge, transformChargeListItem, type RawPaytmOrderListRow, type RawPaytmTxn } from './transform/charge'
import { transformRefund, transformRefundListItem, type RawPaytmRefund, type RawPaytmRefundListRow } from './transform/refund'
import { toMajorUnits, toPaytmDateTime } from './transform/shared'

/** `orderSearchStatus` values the Order List API accepts. There is no
 *  "give me everything" value — a query names exactly one status — so
 *  `listCharges` fans out one request per status and merges the rows. */
const ORDER_SEARCH_STATUSES = ['SUCCESS', 'FAILURE', 'PENDING'] as const

interface RawPaytmOrderListResponse {
  orders?: RawPaytmOrderListRow[] | null
  resultInfo?: { resultStatus?: string; resultCode?: string; resultMsg?: string }
  pageNum?: string | number
  pageSize?: string | number
}

/** Flat response body — no `{head,body}` envelope (see `PaytmClient`'s `raw`
 *  post option). */
interface RawPaytmRefundListResponse {
  status?: string
  count?: number
  resultCode?: string
  errorMessage?: string
  orders?: RawPaytmRefundListRow[] | null
}

/** Split a `getRefund` id into its order + refund components.
 *  Accepts `"<orderId>:<refId>"`; falls back to treating the whole string as
 *  the refund reference (callers must then provide the order id another way). */
function splitRefundId(id: string): { orderId?: string; refId: string } {
  const idx = id.indexOf(':')
  if (idx === -1) return { refId: id }
  return { orderId: id.slice(0, idx), refId: id.slice(idx + 1) }
}

function mid(credentials: Credentials): string {
  const extra = (credentials.extra as Record<string, unknown> | undefined) ?? {}
  return String(extra.mid ?? '')
}

/** Multi-key merchants only (see `credentialFields()`'s helpText); undefined
 *  when not configured, so callers can omit `head.clientId` rather than
 *  sending an empty string. */
function clientId(credentials: Credentials): string | undefined {
  const extra = (credentials.extra as Record<string, unknown> | undefined) ?? {}
  const v = extra.clientId
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

export class PaytmAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'paytm'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error(
      'Paytm uses a Merchant ID + Merchant Key; submit them via the Connect Link form.',
    )
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Paytm uses a Merchant Key; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'environment',
        label: 'Environment',
        type: 'select',
        required: true,
        options: [
          { value: 'staging', label: 'Staging (test)' },
          { value: 'production', label: 'Production (live)' },
        ],
      },
      {
        name: 'mid',
        label: 'Merchant ID (MID)',
        type: 'text',
        required: true,
        helpText: 'Found in your Paytm dashboard under API Keys. Sent as `mid` in every request body.',
      },
      {
        name: 'merchantKey',
        label: 'Merchant Key',
        type: 'password',
        required: true,
        helpText:
          'Used to sign every request (head.signature) and to verify callback/webhook checksums.',
      },
      {
        name: 'clientId',
        label: 'Client ID (optional)',
        type: 'text',
        required: false,
        helpText:
          'Only needed if your Paytm account has more than one Merchant Key (e.g. "C11"). Sent as head.clientId on the Refund List API call.',
      },
    ]
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return buildCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyPaytmWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parsePaytmWebhookEvents(payload)
  }

  private client(credentials: Credentials): PaytmClient {
    return new PaytmClient(credentials)
  }

  // ── Charges (transaction status by order id) ───────────────────────────────

  /**
   * Page the Order List API (`POST /merchant-passbook/search/list/order/v2`)
   * over a date window, CHECKSUM-signed (`head.tokenType: 'CHECKSUM'` — a
   * per-call head override; the legacy PG head fields ride along unused).
   *
   * The API takes exactly one `orderSearchStatus` per call — there is no
   * "ALL" value that returns every status — so this fans out one request per
   * status and merges the rows, the same shape as Finix's balance-entry
   * fan-out. `fromDate`/`toDate` default to the last 30 days (the vendor's
   * documented max range) unless `params.updatedAfter` names a start.
   */
  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    const client = this.client(credentials)
    const toDate = new Date()
    const fromDate = params.updatedAfter ?? new Date(toDate.getTime() - LIST_WINDOW_MS)
    const pageNumber = params.page ?? 1
    const pageSize = params.limit ?? DEFAULT_ORDER_LIST_PAGE_SIZE
    const pages = await Promise.all(
      ORDER_SEARCH_STATUSES.map((orderSearchStatus) =>
        client.post<RawPaytmOrderListResponse>(
          client.merchantPassbookUrl(ORDER_LIST_PATH),
          {
            mid: mid(credentials),
            orderSearchType: 'TRANSACTION',
            orderSearchStatus,
            fromDate: toPaytmDateTime(fromDate),
            toDate: toPaytmDateTime(toDate),
            pageNumber,
            pageSize,
          },
          { head: { tokenType: 'CHECKSUM' } },
        ),
      ),
    )
    return pages.flatMap((page) => page?.orders ?? []).map(transformChargeListItem)
  }

  /** Fetch a transaction by its merchant `orderId` and present it as a charge. */
  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const raw = await this.client(credentials).post<RawPaytmTxn>(TXN_STATUS_PATH, {
      mid: mid(credentials),
      orderId: id,
    })
    return transformCharge(raw ?? {})
  }

  // ── Refunds ──────────────────────────────────────────────────────────────

  /**
   * Page the Refund List API (`POST /merchant-passbook/api/v1/refundList`)
   * over a date window, CHECKSUM-signed with an optional `head.clientId` for
   * multi-key merchants (both are a per-call head override). The response
   * has no `{head,body}` envelope — it's the flat
   * `{status,count,resultCode,errorMessage,orders}` shape — so this reads it
   * with the client's `raw` post option; the default envelope-unwrap would
   * silently collapse it to `{}` (`res.data.body` is undefined on a flat
   * body). `startDate`/`endDate` default to the last 30 days (the vendor's
   * documented max range) unless `params.updatedAfter` names a start.
   */
  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const client = this.client(credentials)
    const endDate = new Date()
    const startDate = params.updatedAfter ?? new Date(endDate.getTime() - LIST_WINDOW_MS)
    const pageNum = params.page ?? 1
    const pageSize = Math.min(params.limit ?? DEFAULT_REFUND_LIST_PAGE_SIZE, MAX_REFUND_LIST_PAGE_SIZE)
    // The refund list takes at most 50 a page. Reported so the router judges a
    // full page against 50, not the caller's larger limit (which read it as
    // the last page). Not an adapter-wide maxPageSize: listCharges has none.
    reportUpstreamPage(params, { pageSize })
    const cid = clientId(credentials)
    const raw = await client.post<RawPaytmRefundListResponse>(
      client.merchantPassbookUrl(REFUND_LIST_PATH),
      {
        mid: mid(credentials),
        startDate: toPaytmDateTime(startDate),
        endDate: toPaytmDateTime(endDate),
        pageNum,
        pageSize,
      },
      { head: { tokenType: 'CHECKSUM', ...(cid ? { clientId: cid } : {}) }, raw: true },
    )
    return (raw?.orders ?? []).map(transformRefundListItem)
  }

  /** Apply a refund against an order. `data.chargeId` = `orderId`;
   *  `data.metadata.txnId` supplies the Paytm `txnId` of the original payment. */
  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.chargeId) throw new Error('chargeId (Paytm orderId) required for refund')
    const txnId = data.metadata?.txnId
    if (!txnId) throw new Error('metadata.txnId (Paytm txnId) required for refund')
    const refId = data.id ?? `re_${Date.now()}`
    const raw = await this.client(credentials).post<RawPaytmRefund>(REFUND_APPLY_PATH, {
      mid: mid(credentials),
      txnType: 'REFUND',
      orderId: data.chargeId,
      txnId,
      refId,
      refundAmount: toMajorUnits(data.amount),
    })
    return transformRefund({ ...raw, orderId: data.chargeId, refId })
  }

  /** Fetch a single refund. `id` is `"<orderId>:<refId>"`. */
  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const { orderId, refId } = splitRefundId(id)
    if (!orderId) {
      throw new Error('Paytm refund lookup needs "<orderId>:<refId>"; order id missing.')
    }
    const raw = await this.client(credentials).post<RawPaytmRefund>(REFUND_STATUS_PATH, {
      mid: mid(credentials),
      orderId,
      refId,
    })
    return transformRefund({ ...raw, orderId, refId })
  }
}
