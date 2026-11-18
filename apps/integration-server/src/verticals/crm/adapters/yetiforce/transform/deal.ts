import type { Deal } from '../../../schema/deal'
import { dateToIso, refId, str, wallTimeToIso } from '../dates'
import { PIPELINE_FIELD } from './pipeline'

/**
 * An SSalesProcesses ("Opportunities") record's raw data (`x-raw-data: 1`),
 * keyed by field name.
 *
 * YetiForce has no Opportunities or Potentials module; its deal module is
 * SSalesProcesses (tabid 86). Field names are the `fieldname` column of the
 * install schema, install/install_schema/data.sql in
 * github.com/YetiForceCompany/YetiForceCRM: subject (mandatory, V~M),
 * ssalesprocesses_status (the stage picklist), related_to (references
 * Accounts only, per vtiger_fieldmodulerel), assigned_user_id,
 * estimated_date (D~M), probability, createdtime, modifiedtime.
 *
 * `estimated` and the other currency fields (uitype 71) carry no currency
 * code on the record, so `value` is left out rather than guessed.
 */
export type RawYetiForceOpportunity = Record<string, unknown>

/** Fields the SSalesProcesses list asks for with `x-fields`. */
export const DEAL_FIELDS = [
  'subject',
  'ssalesprocesses_status',
  'related_to',
  'assigned_user_id',
  'estimated_date',
  'probability',
  'createdtime',
  'modifiedtime',
] as const

function percent(value: unknown): number | undefined {
  const n =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : NaN
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : undefined
}

export function transformDeal(id: string, raw: RawYetiForceOpportunity, rawTimeZone: string): Deal {
  const title = raw['subject']
  if (typeof title !== 'string' || title === '') {
    throw Object.assign(new Error(`YetiForce sales process ${id} has no subject`), {
      statusCode: 502,
    })
  }
  const stage = str(raw['ssalesprocesses_status'])
  return {
    id,
    title,
    stage,
    stage_id: stage,
    pipeline_id: stage !== undefined ? PIPELINE_FIELD : undefined,
    company_id: refId(raw['related_to']),
    owner_id: refId(raw['assigned_user_id']),
    close_date: dateToIso(raw['estimated_date']),
    probability: percent(raw['probability']),
    created_at: wallTimeToIso(raw['createdtime'], rawTimeZone),
    updated_at: wallTimeToIso(raw['modifiedtime'], rawTimeZone),
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out['opportunityname'] = data.title
  if (data.stage !== undefined) out['sales_stage'] = data.stage
  if (data.value?.amount !== undefined) out['amount'] = data.value.amount
  if (data.contact_ids?.[0] !== undefined) out['contact_id'] = data.contact_ids[0]
  if (data.company_id !== undefined) out['accountid'] = data.company_id
  if (data.close_date !== undefined) out['closingdate'] = data.close_date
  if (data.probability !== undefined) out['probability'] = data.probability
  return out
}
