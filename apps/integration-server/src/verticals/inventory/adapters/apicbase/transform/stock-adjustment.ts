/**
 * Transform an Apicbase top count, with its counted stock items, into a
 * canonical StockAdjustment.
 *
 * Apicbase records inventory adjustments as counts ("top counts") per outlet.
 *
 * List endpoint:   GET /api/v2/inventory/outlets/{outlet_id}/count_events/
 *                  (reference/get-top-counts). "Top counts were previously
 *                  listed at `/inventory/outlets/{outlet_id}/count_events/aggregated/`.
 *                  That path still works but is no longer documented and will
 *                  be retired". "The response no longer embeds a
 *                  `counted_items` array."
 * Detail endpoint: GET /api/v2/inventory/outlets/{outlet_id}/count_events/{top_count_id}/
 *                  (reference/get-top-count-details): the same top-level fields.
 * Lines:           GET /api/v2/inventory/outlets/{outlet_id}/count_events/{top_count_id}/stocks/
 *                  (reference/get-stock-items-in-a-top-count): a plain array of
 *                  { stock_item: { id, name, url }, quantity, inventory_log_entries[] }.
 *
 * Documented top count fields read here:
 *   id           — "The top count's ID."
 *   name         — "The top count's name."
 *   status       — "Opened" | "Reopened" | "Closed" | "Processing" | "Awaiting"
 *   full_count   — "Whether the count covers the outlet's full assortment."
 *   created      — "When the top count was started."
 *   actual_date  — "The date the count applies to, as specified by the user." (nullable)
 *   finished     — "When the top count was submitted. Null while the count is still open."
 *   finished_by  — "The user who submitted the top count. Mirrors `owned_by`."
 *                  { id, username, … }. The documented open count ("Opened",
 *                  `finished: null`) carries one too, so it names a submitter
 *                  only once `finished` is set; adjustedBy is empty until then.
 *   stock_value  — "The inventory's total variation in value after the count
 *                  was submitted." A decimal string with no currency, so it is
 *                  kept as metadata, never as money.
 *   remarks      — "Free text entered by the user."
 *   stock_period — { id, name, status } or null
 *
 * No top count field names its outlet, so the caller passes the outlet it was
 * read from.
 *
 * Lines: "These objects represent the variations in inventory caused by a
 * closed count event. The `inventory_log_entries` attribute is only populated
 * in closed top counts." A line's deltaQuantity is therefore the sum of its
 * entries' `variance_quantity`, and its countedQuantity the item's `quantity`
 * ("an aggregation of the sub-counts that make up the top count"). An item
 * with no entries (any count not yet closed) has caused no variation and has
 * no documented delta, so it is not a line: a count still open has none.
 *
 * adjustedAt is the documented `actual_date`, else `created`. Both must carry
 * a UTC offset: the detail example's `created` ("2021-03-29T12:22:58") has
 * none and the docs name no zone, so a zone-less time is not guessed at.
 */
import type { StockAdjustment } from '../../../schema'
import { pickNum, pickStr, strMap } from './shared'

/** A user as the top count documents it (created_by, owned_by, finished_by). */
export interface RawApicbaseUser {
  id?: string
  username?: string
  first_name?: string
  last_name?: string
  url?: string
  [key: string]: unknown
}

/** One top count, as GET …/count_events/ and GET …/count_events/{top_count_id}/ return it. */
export interface RawApicbaseTopCount {
  id: string
  name?: string | null
  status?: string | null
  full_count?: boolean | null
  created?: string | null
  actual_date?: string | null
  finished?: string | null
  created_by?: RawApicbaseUser | null
  owned_by?: RawApicbaseUser | null
  finished_by?: RawApicbaseUser | null
  stock_value?: string | null
  remarks?: string | null
  stock_period?: { id?: string; name?: string; status?: string } | null
  [key: string]: unknown
}

/** One inventory variation a closed count caused for a stock item. */
export interface RawApicbaseInventoryLogEntry {
  theoretical_quantity?: string | null
  quantity?: string | null
  variance_quantity?: string | null
  [key: string]: unknown
}

/** One counted stock item, as GET …/count_events/{top_count_id}/stocks/ returns it. */
export interface RawApicbaseCountedItem {
  stock_item?: { id?: string; name?: string; url?: string } | null
  quantity?: string | null
  inventory_log_entries?: RawApicbaseInventoryLogEntry[] | null
  [key: string]: unknown
}

/** An ISO datetime that carries its own offset ("Z" or "±hh:mm"), normalised; else undefined. */
function zonedIso(v: string | null | undefined): string | undefined {
  if (typeof v !== 'string' || !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(v)) return undefined
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
}

/** The variation a closed count caused for one item, or undefined when it documents none. */
function varianceOf(item: RawApicbaseCountedItem): number | undefined {
  const entries = item.inventory_log_entries ?? []
  if (entries.length === 0) return undefined
  let total = 0
  for (const entry of entries) {
    const v = pickNum(entry.variance_quantity)
    if (v === undefined) return undefined
    total += v
  }
  return total
}

export function transformStockAdjustment(
  raw: RawApicbaseTopCount,
  outletId: string,
  items: readonly RawApicbaseCountedItem[],
): StockAdjustment {
  const countId = pickStr(raw.id)
  if (!countId) throw new Error('apicbase top count has no id')
  if (!outletId) throw new Error(`apicbase top count ${countId}: no outlet id`)
  const adjustedAt = zonedIso(raw.actual_date) ?? zonedIso(raw.created)
  if (!adjustedAt) {
    throw new Error(`apicbase top count ${countId}: no actual_date or created with a UTC offset`)
  }

  const lines: StockAdjustment['lines'] = []
  for (const item of items) {
    const productId = pickStr(item.stock_item?.id)
    const deltaQuantity = varianceOf(item)
    if (!productId || deltaQuantity === undefined) continue
    lines.push({
      productId,
      deltaQuantity,
      countedQuantity: pickNum(item.quantity),
      notes: undefined,
    })
  }

  return {
    // A top count is read back by outlet and id, so the id carries both.
    id: `${countId}:${outletId}`,
    externalId: countId,
    locationId: outletId,
    reason: 'cycle_count',
    lines,
    adjustedAt,
    // Nobody has submitted a count whose `finished` is null, whatever finished_by says.
    adjustedBy: pickStr(raw.finished) ? pickStr(raw.finished_by?.username) : undefined,
    platform: 'apicbase',
    metadata: strMap({
      name: raw.name,
      status: raw.status,
      full_count: raw.full_count,
      created: raw.created,
      finished: raw.finished,
      stock_value: raw.stock_value,
      remarks: raw.remarks,
      stock_period_id: raw.stock_period?.id,
    }),
    raw,
  }
}
