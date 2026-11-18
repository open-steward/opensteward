/**
 * OroCRM opportunity ↔ canonical Deal transform.
 *
 * In OroCRM, "Opportunity" is the CRM entity for sales deals.
 * JSON:API resource type: `opportunities`
 *
 * Key attributes (GET /api/opportunities):
 *   name, status (open/won/lost), probability (0-100),
 *   budgetAmount (object { value, currency }) — value is a decimal major-unit
 *   string (e.g. "50000.00" = $50,000.00),
 *   closeDate (YYYY-MM-DD date string), createdAt, updatedAt
 *
 * Key relationships: account, contact, owner
 *
 * Money: OroCRM stores amounts as major-unit decimals. Canonical schema
 * requires integer minor units (e.g. cents). Convert: major × 100 → minor.
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Deal } from '../../../schema/deal'
import type { JsonApiRecord } from '../client'
import { strAttr, relId } from './shared'

/** Convert a major-unit amount (e.g. 50000.00) to integer minor units (cents). */
function toMinorUnits(value: string | number | undefined | null): number | undefined {
  if (value == null) return undefined
  const n = typeof value === 'number' ? value : parseFloat(String(value))
  if (isNaN(n)) return undefined
  return Math.round(n * 100)
}

/** Convert integer minor units back to major-unit decimal string for the API. */
function fromMinorUnits(minorUnits: number | undefined | null): string | undefined {
  if (minorUnits == null) return undefined
  return (minorUnits / 100).toFixed(2)
}

export function transformDeal(record: JsonApiRecord): Deal {
  const budgetAmount = record.attributes?.['budgetAmount'] as
    | { value?: string | number; currency?: string }
    | null
    | undefined

  const amountMinor = toMinorUnits(budgetAmount?.value)
  const currency = budgetAmount?.currency ?? 'USD'

  const probRaw = record.attributes?.['probability']
  const probability = probRaw != null ? parseFloat(String(probRaw)) : undefined

  const contactId = relId(record, 'contact')
  const accountId = relId(record, 'account')

  return {
    id: String(record.id),
    title: strAttr(record, 'name') ?? '',
    status: strAttr(record, 'status'),
    value: amountMinor != null
      ? { amount: amountMinor, currency }
      : undefined,
    probability: probability != null && !isNaN(probability) ? probability : undefined,
    close_date: toIsoDatetime(strAttr(record, 'closeDate')),
    contact_ids: contactId != null ? [contactId] : undefined,
    company_id: accountId,
    owner_id: relId(record, 'owner'),
    created_at: strAttr(record, 'createdAt'),
    updated_at: strAttr(record, 'updatedAt'),
    metadata: { id: record.id, type: record.type, attributes: record.attributes, relationships: record.relationships },
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const attributes: Record<string, unknown> = {}
  if (data.title !== undefined) attributes['name'] = data.title
  if (data.status !== undefined) attributes['status'] = data.status
  if (data.close_date !== undefined) attributes['closeDate'] = data.close_date
  if (data.probability !== undefined) attributes['probability'] = data.probability
  if (data.value?.amount !== undefined) {
    attributes['budgetAmount'] = {
      value: fromMinorUnits(data.value.amount),
      currency: data.value.currency ?? 'USD',
    }
  }
  return {
    data: {
      type: 'opportunities',
      attributes,
    },
  }
}
