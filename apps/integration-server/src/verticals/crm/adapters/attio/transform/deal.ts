import type { Deal } from '../../../schema/deal'

// ── Raw Attio types ────────────────────────────────────────────────────────

interface AttioTextValue {
  value: string
  attribute_type?: string
}

interface AttioCurrencyValue {
  currency_value: number
  currency_code: string
  attribute_type?: string
}

interface AttioStatusValue {
  status: string
  attribute_type?: string
}

interface AttioDateValue {
  value: string
  attribute_type?: string
}

interface AttioActorRef {
  id: {
    workspace_member_id: string
  }
}

interface AttioRecordId {
  record_id: string
  created_at?: string
}

export interface RawAttioDeal {
  id: AttioRecordId
  values: {
    name?: AttioTextValue[]
    value?: AttioCurrencyValue[]
    stage?: AttioStatusValue[]
    owner?: AttioActorRef[]
    close_date?: AttioDateValue[]
    [key: string]: unknown
  }
  [key: string]: unknown
}

// ── Transform ──────────────────────────────────────────────────────────────

export function transformDeal(raw: RawAttioDeal): Deal {
  const v = raw.values
  const dealValue = v.value?.[0]

  return {
    id: String(raw.id.record_id),
    title: v.name?.[0]?.value ?? '',
    value: dealValue
      ? { amount: dealValue.currency_value, currency: dealValue.currency_code }
      : undefined,
    stage_id: v.stage?.[0]?.status,
    owner_id: v.owner?.[0]?.id.workspace_member_id
      ? String(v.owner[0].id.workspace_member_id)
      : undefined,
    close_date: v.close_date?.[0]?.value,
    created_at: raw.id.created_at,
    metadata: raw,
  }
}

// ── Untransform ────────────────────────────────────────────────────────────

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const values: Record<string, unknown> = {}

  if (data.title !== undefined) {
    values['name'] = [{ value: data.title }]
  }
  if (data.value !== undefined) {
    values['value'] = [{
      currency_value: data.value.amount,
      currency_code: data.value.currency,
    }]
  }
  if (data.stage_id !== undefined) {
    values['stage'] = [{ status: data.stage_id }]
  }
  if (data.close_date !== undefined) {
    values['close_date'] = [{ value: data.close_date }]
  }

  return { data: { values } }
}
