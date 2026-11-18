/**
 * Transform Eudonet company/account rows (Tab 100) to canonical Company.
 *
 * Key Eudonet field DescIds for companies (table 100):
 *   101 — Name
 *   102 — Domain / Website
 *   103 — Phone
 *   104 — Industry
 *   105 — Size (headcount)
 *   190 — CreatedAt (ISO 8601)
 *   191 — UpdatedAt (ISO 8601)
 */

import type { Company } from '../../../schema/company'
import { toIsoDatetime } from '@opensteward/shared'
import type { EudonetRow } from '../client'
import { fieldValue, fieldNumber } from '../client'
import {
  FIELD_COMPANY_NAME,
  FIELD_COMPANY_DOMAIN,
  FIELD_COMPANY_PHONE,
  FIELD_COMPANY_INDUSTRY,
  FIELD_COMPANY_SIZE,
  FIELD_COMPANY_CREATED_AT,
  FIELD_COMPANY_UPDATED_AT,
} from '../constants'

export function transformCompany(row: EudonetRow): Company {
  return {
    id:         String(row.FileId),
    name:       fieldValue(row, FIELD_COMPANY_NAME) ?? '',
    domain:     fieldValue(row, FIELD_COMPANY_DOMAIN),
    phone:      fieldValue(row, FIELD_COMPANY_PHONE),
    industry:   fieldValue(row, FIELD_COMPANY_INDUSTRY),
    size:       fieldNumber(row, FIELD_COMPANY_SIZE),
    created_at: toIsoDatetime(fieldValue(row, FIELD_COMPANY_CREATED_AT)),
    updated_at: toIsoDatetime(fieldValue(row, FIELD_COMPANY_UPDATED_AT)),
    metadata:   row as unknown as Record<string, unknown>,
  }
}

export function untransformCompany(data: Partial<Company>): { DescId: number; Value: unknown }[] {
  const fields: { DescId: number; Value: unknown }[] = []
  if (data.name     !== undefined) fields.push({ DescId: FIELD_COMPANY_NAME,     Value: data.name })
  if (data.domain   !== undefined) fields.push({ DescId: FIELD_COMPANY_DOMAIN,   Value: data.domain })
  if (data.phone    !== undefined) fields.push({ DescId: FIELD_COMPANY_PHONE,    Value: data.phone })
  if (data.industry !== undefined) fields.push({ DescId: FIELD_COMPANY_INDUSTRY, Value: data.industry })
  if (data.size     !== undefined) fields.push({ DescId: FIELD_COMPANY_SIZE,     Value: data.size })
  return fields
}
