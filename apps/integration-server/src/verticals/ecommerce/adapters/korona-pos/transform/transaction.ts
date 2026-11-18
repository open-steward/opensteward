/**
 * KORONA Receipt → canonical Transaction (read-only — receipts are POS
 * sale records, never created through this API).
 *
 * Shape verified against `components.schemas.Receipt` and `ReceiptTotal` on
 * https://128.koronacloud.com/web/api/v3/openapi.json.
 *
 * `Receipt.total` (`{ gross, net, tax }`) has no currency field, same as
 * every other monetary field on this platform (see `transform/product.ts`).
 * The one real currency signal is the account's `/currencies` resource —
 * `index.ts` resolves the entry with `systemCurrency: true` once per call
 * and passes its `key` in here; `amount` is only populated when that
 * resolution actually produced a valid ISO 4217 code.
 *
 * `orderId` is left unset: `Receipt.orderNumber` is the *business* order
 * number, not a `CustomerOrder.id`, and nothing in the schema links the two
 * ids directly.
 */

import { Iso4217Currency } from '@opensteward/shared'
import { toIsoDatetime } from '@opensteward/shared'
import { majorToMinor } from '../../../schema/shared'
import type { Transaction, TransactionKind, TransactionStatus } from '../../../schema/transaction'

export interface KoronaReceiptTotal {
  gross?: number
}

export interface KoronaReceipt {
  id: string
  number?: string
  cancelled?: boolean
  voided?: boolean
  reversal?: boolean
  bookingTime?: string
  creationTime?: string
  total?: KoronaReceiptTotal
}

/** A receipt only exists once a sale is completed — voided/cancelled is
 *  the one distinguishable exception, mapped to the enum's own `'unknown'`
 *  member rather than guessing which of PENDING/FAILURE/ERROR it means. */
function mapStatus(raw: KoronaReceipt): TransactionStatus {
  return raw.cancelled === true || raw.voided === true ? 'unknown' : 'SUCCESS'
}

function mapKind(raw: KoronaReceipt): TransactionKind {
  return raw.reversal === true ? 'REFUND' : 'SALE'
}

export function transformReceipt(raw: KoronaReceipt, currency: string | undefined): Transaction {
  const validCurrency = currency && Iso4217Currency.safeParse(currency).success ? currency : undefined
  return {
    id: raw.id,
    kind: mapKind(raw),
    status: mapStatus(raw),
    amount:
      validCurrency && raw.total?.gross != null
        ? { amount: majorToMinor(raw.total.gross, validCurrency), currency: validCurrency }
        : undefined,
    processedAt: toIsoDatetime(raw.bookingTime),
    createdAt: toIsoDatetime(raw.creationTime),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
