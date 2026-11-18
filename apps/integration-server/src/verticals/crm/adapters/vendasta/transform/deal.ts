/**
 * Deal transform: Vendasta CRM Opportunity <-> OpenSteward canonical Deal.
 *
 * Vendasta maps deals as "opportunities" with the same CRM object structure.
 * Relevant field IDs (from CRM OpenAPI spec — CRMOpportunityChangeActivity + custom):
 *
 * Because the Vendasta CRM API is schema-flexible (field IDs are platform-defined
 * and operators can configure custom fields), we use the most common standard IDs
 * observed in the OpenAPI spec and documentation. Standard opportunity field IDs
 * follow the `standard__activity_opportunity_change_*` prefix for activity history;
 * for the opportunity object itself we use what is available.
 *
 *   system__contact_id / crmObjectId         — unique record ID
 *   standard__company_name / similar name    — opportunity title / name
 *   standard__activity_opportunity_change_name — deal title when in activity context
 *
 * Since Vendasta doesn't expose a rigid set of "opportunity" object field IDs in the
 * public spec (the spec only shows change-activity fields), we use sensible field IDs
 * that match the Vendasta CRM platform conventions.
 */

import type { Deal } from '../../../schema/deal'
import {
  type VendastaCrmObject,
  type VendastaFieldValue,
  getField,
  strField,
  currencyField,
} from '../client'

export type RawVendastaOpportunity = VendastaCrmObject

/**
 * Field IDs commonly used for Vendasta opportunities.
 * The platform uses a flexible field schema; these are the standard IDs.
 */
const FIELD = {
  NAME:        'standard__opportunity_name',
  STAGE:       'standard__opportunity_stage',
  PIPELINE_ID: 'standard__opportunity_pipeline_id',
  CLOSE_DATE:  'standard__opportunity_close_date',
  VALUE:       'standard__opportunity_value',
  STATUS:      'standard__opportunity_status',
  OWNER_ID:    'system__opportunity_owner_id',
  CONTACT_ID:  'standard__opportunity_contact_id',
  COMPANY_ID:  'standard__opportunity_company_id',
  CREATED:     'system__opportunity_created',
  UPDATED:     'system__opportunity_updated',
} as const

export function transformDeal(raw: RawVendastaOpportunity): Deal {
  const f = raw.fields ?? []
  const id = raw.crmObjectId ?? ''

  // Value field: look for currency value first, then string
  let amount: number | undefined
  let currency = 'USD'
  const valueField = f.find((fv) => fv.fieldId === FIELD.VALUE)
  if (valueField) {
    if (valueField.currencyValue) {
      amount = valueField.currencyValue.value ?? undefined
      currency = valueField.currencyValue.currencyCode ?? 'USD'
    } else if (valueField.floatValue !== undefined) {
      amount = valueField.floatValue
    } else if (valueField.stringValue !== undefined) {
      const n = parseFloat(valueField.stringValue)
      if (!isNaN(n)) amount = n
    }
  }

  const closeDateRaw = getField(f, FIELD.CLOSE_DATE)

  return {
    id: String(id),
    title:       getField(f, FIELD.NAME) ?? '',
    value:       amount !== undefined ? { amount, currency } : undefined,
    status:      getField(f, FIELD.STATUS),
    stage_id:    getField(f, FIELD.STAGE),
    pipeline_id: getField(f, FIELD.PIPELINE_ID),
    owner_id:    raw.ownerId ?? getField(f, FIELD.OWNER_ID),
    contact_ids: (() => {
      const cid = getField(f, FIELD.CONTACT_ID)
      return cid ? [cid] : undefined
    })(),
    company_id:  getField(f, FIELD.COMPANY_ID),
    close_date:  closeDateRaw,
    created_at:  raw.created,
    updated_at:  raw.updated,
    metadata:    raw as Record<string, unknown>,
  }
}

export function untransformDeal(data: Partial<Deal>): VendastaFieldValue[] {
  const fields: VendastaFieldValue[] = []
  const push = (fv: VendastaFieldValue | null) => { if (fv) fields.push(fv) }

  push(strField(FIELD.NAME,        data.title))
  push(strField(FIELD.STATUS,      data.status ?? undefined))
  push(strField(FIELD.STAGE,       data.stage_id ?? undefined))
  push(strField(FIELD.PIPELINE_ID, data.pipeline_id ?? undefined))
  push(strField(FIELD.CLOSE_DATE,  data.close_date ?? undefined))

  if (data.value?.amount !== undefined) {
    fields.push(currencyField(FIELD.VALUE, data.value.amount, data.value.currency ?? 'USD'))
  }

  if (data.contact_ids?.[0]) {
    push(strField(FIELD.CONTACT_ID, data.contact_ids[0]))
  }
  push(strField(FIELD.COMPANY_ID, data.company_id ?? undefined))

  return fields
}
