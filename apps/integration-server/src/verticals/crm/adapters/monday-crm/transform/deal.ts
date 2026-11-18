import type { Deal } from '../../../schema/deal'
import { type MondayItem, getColumnValue } from '../client'

export function transformDeal(raw: MondayItem): Deal {
  const valueText = getColumnValue(raw, 'numbers')
  const amount = valueText ? parseFloat(valueText) : undefined
  return {
    id: raw.id,
    title: raw.name,
    value: amount != null && !Number.isNaN(amount)
      ? { amount, currency: 'USD' }
      : undefined,
    stage_id: getColumnValue(raw, 'status'),
    close_date: getColumnValue(raw, 'date'),
    owner_id: getColumnValue(raw, 'people'),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const columnValues: Record<string, unknown> = {}
  if (data.value?.amount !== undefined) columnValues['numbers'] = data.value.amount
  if (data.stage_id !== undefined) columnValues['status'] = { label: data.stage_id }
  if (data.close_date !== undefined) columnValues['date'] = { date: data.close_date }
  if (data.owner_id !== undefined) columnValues['people'] = { personsAndTeams: [{ id: Number(data.owner_id), kind: 'person' }] }
  return {
    name: data.title ?? '',
    column_values: JSON.stringify(columnValues),
  }
}
