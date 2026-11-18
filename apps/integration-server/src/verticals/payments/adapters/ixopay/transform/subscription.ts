import type { Subscription, SubscriptionStatus } from '../../../schema/subscription'
import { toIsoDatetime } from '@opensteward/shared'
import { pickStr, strMap } from './shared'

/**
 * IXOPAY Schedule — maps to the canonical Subscription resource.
 *
 * IXOPAY exposes recurring billing via the Schedule API:
 *   POST /schedule/{apiKey}/start
 *   POST /schedule/{apiKey}/{scheduleId}/update
 *   GET  /schedule/{apiKey}/{scheduleId}/get
 *   POST /schedule/{apiKey}/{scheduleId}/pause
 *   POST /schedule/{apiKey}/{scheduleId}/continue
 *   POST /schedule/{apiKey}/{scheduleId}/cancel
 *
 * The ScheduleResponse shape (all operations):
 *   success, scheduleId, registrationId, oldStatus, newStatus,
 *   scheduledAt, merchantMetaData
 *
 * ScheduleStatus values: ACTIVE | PAUSED | CANCELLED | ERROR | CREATE-PENDING
 *
 * Docs: https://documentation.ixopay.com/docs/reference/features/scheduler
 *       https://gateway.ixopay.com/Schema/V3/OpenApiSpecification.yml
 */
export interface RawIxopaySchedule {
  success?: boolean
  scheduleId?: string
  registrationId?: string
  /** Status before this operation. */
  oldStatus?: string
  /** Status after this operation (the current status). */
  newStatus?: string
  /** ISO datetime of the next scheduled charge. */
  scheduledAt?: string
  merchantMetaData?: string
  /** Present on start/update to echo back the submitted period parameters. */
  periodLength?: number
  /** DAY | WEEK | MONTH | YEAR */
  periodUnit?: string
  amount?: string | number
  currency?: string
  errors?: Array<{ message?: string; code?: number | string; adapterMessage?: string }>
  [k: string]: unknown
}

function mapStatus(raw: RawIxopaySchedule): SubscriptionStatus {
  const s = (raw.newStatus ?? raw.oldStatus ?? '').toUpperCase()
  if (s === 'ACTIVE') return 'active'
  if (s === 'PAUSED') return 'paused'
  if (s === 'CANCELLED') return 'cancelled'
  if (s === 'ERROR') return 'past_due'
  if (s === 'CREATE-PENDING') return 'incomplete'
  return 'incomplete'
}

export function transformSubscription(raw: RawIxopaySchedule): Subscription {
  return {
    id: String(raw.scheduleId ?? ''),
    externalId: String(raw.scheduleId ?? ''),
    customerId: String(raw.registrationId ?? ''),
    status: mapStatus(raw),
    currency: typeof raw.currency === 'string' ? raw.currency.toUpperCase() : undefined,
    items: [],
    currentPeriodStart: undefined,
    currentPeriodEnd: toIsoDatetime(raw.scheduledAt),
    cancelledAt: raw.newStatus?.toUpperCase() === 'CANCELLED'
      ? toIsoDatetime(raw.scheduledAt)
      : undefined,
    gateway: 'ixopay',
    metadata: strMap({
      registrationId: raw.registrationId,
      oldStatus: raw.oldStatus,
      newStatus: raw.newStatus,
      periodLength: raw.periodLength,
      periodUnit: raw.periodUnit,
      merchantMetaData: pickStr(raw.merchantMetaData),
    }),
    raw,
  }
}
