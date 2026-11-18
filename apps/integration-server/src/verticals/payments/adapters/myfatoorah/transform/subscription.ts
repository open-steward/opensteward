import type { Subscription, SubscriptionStatus } from '../../../schema/subscription'
import { strMap, toMinorUnits } from './shared'

// Derived from GET /v2/getRecurringPayment
// Fields: RecurringId, RecurringStatus, RecurringValue, RecurringType,
//         IntervalDays, ExecutedTimes, LastPayDate, NextPayDate, IsActive,
//         CreationDate, RecurringInvoices[]
export interface RawMyfatoorahRecurringPayment {
  [k: string]: unknown
}

function mapStatus(status: string | undefined | null, isActive: unknown): SubscriptionStatus {
  const v = typeof status === 'string' ? status.toLowerCase() : ''
  if (v === 'active' || isActive === true) return 'active'
  if (v === 'canceled' || v === 'cancelled') return 'cancelled'
  if (v === 'completed') return 'expired'
  if (v === 'draft') return 'incomplete'
  if (v === 'uncompleted' || v === 'paused') return 'paused'
  return 'active'
}

export function transformSubscription(raw: RawMyfatoorahRecurringPayment): Subscription {
  return {
    id: String(raw['RecurringId'] ?? ''),
    externalId: String(raw['RecurringId'] ?? ''),
    // MyFatoorah recurring payments reference a CustomerReference in nested invoices;
    // no top-level customerId field exists on the recurring object itself
    customerId: String(raw['CustomerReference'] ?? raw['CustomerId'] ?? ''),
    status: mapStatus(raw['RecurringStatus'] as string | undefined, raw['IsActive']),
    items: [
      {
        id: String(raw['RecurringId'] ?? ''),
        amount: toMinorUnits(raw['RecurringValue']),
      },
    ],
    currentPeriodStart: raw['LastPayDate'] != null ? String(raw['LastPayDate']) : undefined,
    currentPeriodEnd: raw['NextPayDate'] != null ? String(raw['NextPayDate']) : undefined,
    cancelledAt: raw['CancellationDate'] != null ? String(raw['CancellationDate']) : undefined,
    gateway: 'myfatoorah',
    metadata: strMap({}),
    createdAt: raw['CreationDate'] != null ? String(raw['CreationDate']) : undefined,
    raw,
  }
}
