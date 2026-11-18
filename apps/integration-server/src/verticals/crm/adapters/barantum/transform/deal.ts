import type { Deal } from '../../../schema/deal'
import { requireUuid, text } from './fields'

/**
 * A row of the Deals module, as `POST /api/get_list_data` with
 * `"module": "Deals"` returns it in `result.content[]`.
 *
 * Docs: https://docs.barantum.com/api/collections/23513668/2sBYAuTBr5
 * ("[Deals] Get Data", Expected Response). Only the fields this transform
 * reads are typed; the rest stay in `metadata`.
 *
 * Not mapped, on purpose:
 *   - `deals_amount` (300000) comes with `currency_serial_id: "Rp."`, a
 *     display symbol and not an ISO 4217 code, so there is no documented
 *     currency to pair it with and `value` is omitted.
 *   - `deals_close_date`, `deals_expected_close_date`, `date_created` and
 *     `date_modified` ("2022-09-11 07:00:00") carry no zone, and the docs
 *     name none.
 *   - `deals_person_name` is a list of names, not contact ids.
 *   - `deals_owner` is a name, not a user id.
 *   - `deals_sales_stage`: the Deals key-fields table calls it "Sales stage
 *     (numeric ID)" and the Save Data example sends `17`, yet the Get Data
 *     example returns `"Lead In"` in it. The stage label is read from the
 *     response's `sales_stage_name` ("Lead In") instead, and no stage_id is
 *     mapped from a field whose documented type contradicts its example.
 */
export interface RawBarantumDeal {
  deals_uuid: string
  deals_name?: string | null
  sales_stage_name?: string | null
  deals_organization_uuid?: string | null
  [key: string]: unknown
}

export function transformDeal(raw: RawBarantumDeal): Deal {
  const id = requireUuid(raw, 'deals_uuid', 'Deals')
  const title = text(raw.deals_name)
  if (title === undefined) throw new Error(`Barantum Deals ${id} has no deals_name`)
  return {
    id,
    title,
    stage: text(raw.sales_stage_name),
    company_id: text(raw.deals_organization_uuid),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.name = data.title
  if (data.value !== undefined) {
    // The CRM vertical carries deal money in major units, as the reference
    // adapter (nutshell) maps it, so the amount passes through unscaled.
    out.value = data.value.amount
    out.currency = data.value.currency
  }
  if (data.status !== undefined) out.status = data.status
  if (data.stage !== undefined) out.stage = data.stage
  if (data.pipeline_id !== undefined) out.pipeline_id = data.pipeline_id
  if (data.close_date !== undefined) out.close_date = data.close_date
  return out
}
