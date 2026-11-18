/**
 * Note transform for Corteza CRM.
 *
 * Field names are those of the `Note` module in Corteza's CRM application
 * (corteza-server provision/700_crm/1100_modules.yaml): Body (String), Title
 * (String), ContactId, AccountId and OpportunityId (Record). The module has
 * no owner field.
 */

import { toIsoDatetime } from '@opensteward/shared'
import type { Note } from '../../../schema/note'
import type { CortezaRecord, CortezaFieldValue } from '../client'

/**
 * A record value by field name. Corteza omits `value` when it is empty
 * (record_value.go: `Value string json:"value,omitempty"`), so absent and ''
 * both read as undefined.
 */
function field(record: CortezaRecord, name: string): string | undefined {
  const found = record.values?.find((v) => v.name === name)
  return found?.value !== undefined && found.value !== '' ? found.value : undefined
}

export { CortezaRecord as RawCortezaNote }

export function transformNote(raw: CortezaRecord): Note {
  return {
    id: String(raw.recordID),
    // An empty value is omitted by Corteza, so absent is the empty body.
    content: field(raw, 'Body') ?? '',
    contact_id: field(raw, 'ContactId'),
    company_id: field(raw, 'AccountId'),
    deal_id: field(raw, 'OpportunityId'),
    created_at: toIsoDatetime(raw.createdAt),
    updated_at: toIsoDatetime(raw.updatedAt),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformNote(data: Partial<Note>): CortezaFieldValue[] {
  const values: CortezaFieldValue[] = []
  if (data.content !== undefined) values.push({ name: 'Note', value: data.content })
  if (data.contact_id !== undefined) values.push({ name: 'ContactId', value: data.contact_id })
  if (data.company_id !== undefined) values.push({ name: 'AccountId', value: data.company_id })
  if (data.owner_id !== undefined) values.push({ name: 'OwnerId', value: data.owner_id })
  return values
}
