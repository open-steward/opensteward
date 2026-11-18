/**
 * Transform Eudonet opportunity/deal rows (Tab 300) to canonical Deal.
 *
 * Key Eudonet field DescIds for deals (table 300):
 *   301 — Title / Name
 *   302 — Status (open/won/lost)
 *   303 — Stage label
 *   304 — Amount (numeric)
 *   305 — Currency (ISO 4217 code)
 *   306 — Company ID (linked)
 *   307 — Close date (ISO 8601)
 *   390 — CreatedAt (ISO 8601)
 *   391 — UpdatedAt (ISO 8601)
 */

import type { Deal } from '../../../schema/deal'
import { toIsoDatetime } from '@opensteward/shared'
import type { EudonetRow } from '../client'
import { fieldValue, fieldNumber } from '../client'
import {
  FIELD_DEAL_TITLE,
  FIELD_DEAL_STATUS,
  FIELD_DEAL_STAGE,
  FIELD_DEAL_AMOUNT,
  FIELD_DEAL_CURRENCY,
  FIELD_DEAL_COMPANY_ID,
  FIELD_DEAL_CLOSE_DATE,
  FIELD_DEAL_CREATED_AT,
  FIELD_DEAL_UPDATED_AT,
} from '../constants'

export function transformDeal(row: EudonetRow): Deal {
  const amount   = fieldNumber(row, FIELD_DEAL_AMOUNT)
  const currency = fieldValue(row, FIELD_DEAL_CURRENCY)

  return {
    id:         String(row.FileId),
    title:      fieldValue(row, FIELD_DEAL_TITLE) ?? '',
    status:     fieldValue(row, FIELD_DEAL_STATUS),
    stage:      fieldValue(row, FIELD_DEAL_STAGE),
    value:      amount != null ? { amount, currency: currency ?? 'EUR' } : undefined,
    company_id: fieldValue(row, FIELD_DEAL_COMPANY_ID),
    close_date: toIsoDatetime(fieldValue(row, FIELD_DEAL_CLOSE_DATE)),
    created_at: toIsoDatetime(fieldValue(row, FIELD_DEAL_CREATED_AT)),
    updated_at: toIsoDatetime(fieldValue(row, FIELD_DEAL_UPDATED_AT)),
    metadata:   row as unknown as Record<string, unknown>,
  }
}

export function untransformDeal(data: Partial<Deal>): { DescId: number; Value: unknown }[] {
  const fields: { DescId: number; Value: unknown }[] = []
  if (data.title      !== undefined) fields.push({ DescId: FIELD_DEAL_TITLE,      Value: data.title })
  if (data.status     !== undefined) fields.push({ DescId: FIELD_DEAL_STATUS,     Value: data.status })
  if (data.stage      !== undefined) fields.push({ DescId: FIELD_DEAL_STAGE,      Value: data.stage })
  if (data.value      !== undefined) fields.push({ DescId: FIELD_DEAL_AMOUNT,     Value: data.value.amount })
  if (data.value?.currency !== undefined) fields.push({ DescId: FIELD_DEAL_CURRENCY, Value: data.value.currency })
  if (data.company_id !== undefined) fields.push({ DescId: FIELD_DEAL_COMPANY_ID, Value: data.company_id })
  if (data.close_date !== undefined) fields.push({ DescId: FIELD_DEAL_CLOSE_DATE, Value: data.close_date })
  return fields
}
