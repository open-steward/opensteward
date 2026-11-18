import type { Company } from '../../../schema/company'
import { type MondayItem, getColumnValue } from '../client'

export function transformCompany(raw: MondayItem): Company {
  return {
    id: raw.id,
    name: raw.name,
    domain: getColumnValue(raw, 'link'),
    phone: getColumnValue(raw, 'phone'),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const columnValues: Record<string, unknown> = {}
  if (data.domain !== undefined) columnValues['link'] = { url: data.domain, text: data.domain }
  if (data.phone !== undefined) columnValues['phone'] = data.phone
  return {
    name: data.name ?? '',
    column_values: JSON.stringify(columnValues),
  }
}
