/**
 * Transform Apicbase transfer events → canonical StockTransfer.
 *
 * Apicbase exposes transfer events per outlet, split into two directions:
 *   Incoming: GET /api/v2/inventory/outlets/{outlet_id}/transfer_events/incoming/
 *             (reference/get-incoming-transfer-events): "Lists transfers **to** this outlet."
 *   Outgoing: GET /api/v2/inventory/outlets/{outlet_id}/transfer_events/outgoing/
 *             (reference/get-outgoing-transfer-events): "Lists transfers **from** this outlet."
 *
 * Each endpoint returns DRF-style paginated results. Documented row fields:
 *   id                 — the transfer event's id
 *   name               — e.g. "Transfer #18"
 *   status             — incoming rows and the outgoing detail: a label,
 *                        "Closed" (reference/get-incoming-transfer-events,
 *                        get-outgoing-transfer-event) or "Opened", with
 *                        `finished: null` (reference/claim-outgoing-transfer-event)
 *   in_progress        — outgoing rows instead of `status`: a boolean
 *                        (the documented row has `false` with `finished` set)
 *   created / finished — ISO datetimes
 *   actual_date        — "the event's actual date, as specified by the user",
 *                        or null
 *   remarks            — free text
 *   stock_value        — a decimal string ("In outgoing transfer events,
 *                        `stock_value` is normally a negative number.")
 *   items[]            — { stock_item: { id, name, url }, quantity: "10", stock_value, … }
 *   origin_outlet      — incoming rows: the sending outlet's URL
 *   destination_outlet — outgoing rows: the receiving outlet's URL
 *
 * Neither names the outlet it was listed from, so the caller injects it as
 * `outlet`; the other end comes from the outlet URL.
 *
 * Status is inferred, not documented: for transfers the docs define no
 * meaning for the "Closed" and "Opened" labels, for `in_progress`, or for the
 * "0" / "1" / "2" values the `status` filter takes ("Filter on the event's
 * status."). The documented "Closed" and `in_progress: false` rows both carry
 * a `finished` timestamp, so both read as completed; the documented "Opened"
 * event has `finished: null`, so it reads as draft, and so does
 * `in_progress: true`. That follows the inventory events that do document
 * their lifecycle, waste events: "Inventory is only updated at step 4, when
 * the waste event is submitted." (docs/recording-waste-events), and Submit
 * Waste Event "Closes and submits a waste event." (reference/submit-waste-event),
 * answering `"status": "Closed"`. Anything else is unknown.
 */
import type { StockTransfer, StockTransferStatus } from '../../../schema'
import { pickNum, pickStr, strMap, toIso } from './shared'

export type TransferDirection = 'incoming' | 'outgoing'

export interface RawApicbaseTransferItem {
  /** Documented as { id, name, url } (reference/get-incoming-transfer-events). */
  stock_item?: string | { uid?: string; id?: string; name?: string | null; url?: string | null } | null
  quantity?: number | string | null
  [key: string]: unknown
}

export interface RawApicbaseTransferEvent {
  uid?: string
  id?: string
  name?: string | null
  /**
   * A label ("Closed", "Opened") on incoming rows and the outgoing detail.
   * The endpoints' `status` filter takes "0", "1" or "2", with no meaning
   * documented; a number is read as before, 0 = draft, 1 = in transit,
   * 2 = completed.
   */
  status?: number | string | null
  /** Outgoing rows: whether the event is still in progress (not finished). */
  in_progress?: boolean | null
  created?: string | null
  created_date?: string | null
  finished?: string | null
  actual_date?: string | null
  remarks?: string | null
  created_by?: unknown
  owned_by?: unknown
  /** The outlet the row was listed from (injected by the caller). */
  outlet?: string | { uid?: string; id?: string } | null
  /** Incoming rows: the sending outlet's URL, ".../accounts/outlets/{id}/". */
  origin_outlet?: string | null
  /** Outgoing rows: the receiving outlet's URL. */
  destination_outlet?: string | null
  items?: RawApicbaseTransferItem[]
  [key: string]: unknown
}

function extractId(
  v: string | { uid?: string; id?: string } | null | undefined,
): string {
  if (!v) return ''
  if (typeof v === 'string') return v
  return pickStr(v.uid ?? v.id) ?? ''
}

/** The outlet id an outlet URL names (".../accounts/outlets/729100266010004/"), or a bare id as it is. */
function outletIdOf(v: string | null | undefined): string {
  if (!v) return ''
  const m = /\/outlets\/([^/?#]+)\/?(?:[?#].*)?$/.exec(v)
  if (m) return m[1]!
  return v.includes('/') ? '' : v
}

function mapStatus(raw: RawApicbaseTransferEvent): StockTransferStatus {
  const s = raw.status
  if (typeof s === 'number') {
    switch (s) {
      case 0: return 'draft'
      case 1: return 'in_transit'
      case 2: return 'completed'
      default: return 'unknown'
    }
  }
  if (typeof s === 'string' && s !== '') {
    switch (s.trim().toLowerCase()) {
      case 'closed': return 'completed'
      // Not finished, so nothing has moved yet: the same as in_progress: true.
      case 'opened': return 'draft'
      default: return 'unknown'
    }
  }
  // An event still in progress is not finished, so nothing has moved yet.
  if (typeof raw.in_progress === 'boolean') return raw.in_progress ? 'draft' : 'completed'
  return 'unknown'
}

export function transformStockTransfer(
  raw: RawApicbaseTransferEvent,
  direction: TransferDirection,
): StockTransfer {
  const id = pickStr(raw.uid ?? raw.id) ?? ''
  const listedAt = extractId(raw.outlet)

  // An outgoing event leaves the outlet it was listed from for its
  // destination_outlet; an incoming one arrives there from its origin_outlet.
  const fromLocationId = direction === 'outgoing' ? listedAt : outletIdOf(raw.origin_outlet)
  const toLocationId = direction === 'incoming' ? listedAt : outletIdOf(raw.destination_outlet)

  return {
    id,
    externalId: id,
    number: undefined,
    fromLocationId,
    toLocationId,
    status: mapStatus(raw),
    lines: (raw.items ?? []).map((item) => ({
      productId: extractId(item.stock_item),
      quantity: pickNum(item.quantity) ?? 0,
      quantityReceived: undefined,
    })),
    shippedAt: direction === 'outgoing' ? toIso(raw.actual_date) : undefined,
    receivedAt: direction === 'incoming' ? toIso(raw.actual_date) : undefined,
    platform: 'apicbase',
    metadata: strMap({
      direction,
      rawStatus: raw.status != null ? String(raw.status) : undefined,
      in_progress: raw.in_progress,
      remarks: raw.remarks,
      created_date: raw.created_date ?? raw.created,
      finished: raw.finished,
    }),
    raw,
  }
}
