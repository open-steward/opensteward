/**
 * Openpay plan → canonical Plan.
 *
 * Fields from "Objeto Plan" (https://documents.openpay.mx/docs/api/index.html):
 * id, creation_date, name, amount ("Monto que se aplicará cada vez que se
 * cobre la suscripción. ... con hasta 2 dígitos decimales."), currency,
 * repeat_every ("Número de unidades tiempo entre los que se cobrará la
 * suscripción."), repeat_unit ("Puede ser semanal(week), mensual(month) o
 * anual(year)."), retry_times, status ("active o deleted"),
 * status_after_retry, trial_days.
 */
import type { BillingInterval, Plan } from '../../../schema/plan'
import { optString, requireCurrency, requireId, requireMinorAmount } from './shared'

export interface RawOpenpayPlan {
  id?: string
  name?: string
  status?: string
  amount?: number
  currency?: string
  creation_date?: string
  repeat_every?: number
  repeat_unit?: string
  retry_times?: number
  status_after_retry?: string
  trial_days?: number
  [k: string]: unknown
}

const INTERVALS: Record<string, BillingInterval> = {
  week: 'week',
  month: 'month',
  year: 'year',
}

export function transformPlan(raw: RawOpenpayPlan): Plan {
  const id = requireId(raw, 'plan')
  const currency = requireCurrency(raw, 'plan')
  const interval = typeof raw.repeat_unit === 'string' ? INTERVALS[raw.repeat_unit] : undefined
  if (!interval) {
    throw new Error(`Openpay plan ${id} has undocumented repeat_unit ${String(raw.repeat_unit)}`)
  }
  const every = raw.repeat_every
  const trial = raw.trial_days
  return {
    id,
    externalId: id,
    nickname: optString(raw.name),
    active: raw.status === 'active' ? true : raw.status === 'deleted' ? false : undefined,
    amount: requireMinorAmount(raw, currency, 'plan'),
    currency,
    interval,
    intervalCount:
      typeof every === 'number' && Number.isInteger(every) && every >= 1 ? every : undefined,
    trialPeriodDays:
      typeof trial === 'number' && Number.isInteger(trial) && trial >= 0 ? trial : undefined,
    gateway: 'openpay',
    metadata: {},
    createdAt: optString(raw.creation_date),
    raw,
  }
}
