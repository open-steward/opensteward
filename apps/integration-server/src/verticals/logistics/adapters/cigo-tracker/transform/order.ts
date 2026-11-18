import type { Order, OrderStatus } from '../../../schema/order'
import type { CigoJobResponse } from '../types'
import { jobAddress, jobOf } from './shipment'

/** The documented job statuses, onto the order lifecycle. */
function mapOrderStatus(status: string | null | undefined): OrderStatus {
  switch (status) {
    case 'staging':
    case 'new':
      return 'PENDING'
    // "Once an operator selects 'On Route' in the mobile app"
    case 'in progress':
      return 'SHIPPED'
    case 'completed':
      return 'DELIVERED'
    case 'cancelled':
      return 'CANCELLED'
    default:
      return 'unknown'
  }
}

/**
 * A CIGO job as an order: CIGO has no order resource, and a job's `actions`
 * are its to-do list of items ("Actions serve as a to-do list for the
 * Operator arriving on site"). Action `value` and job `balance_owed` carry no
 * documented currency, so no amounts are mapped.
 */
export function transformOrder(raw: CigoJobResponse): Order {
  const job = jobOf(raw)
  return {
    id: job.job_id,
    status: mapOrderStatus(job.status),
    orderNumber: job.reference_id ?? undefined,
    destinationAddress: jobAddress(job),
    lineItems: raw.actions?.map((a) => ({
      id: a.action_id ?? undefined,
      sku: a.id ?? undefined,
      description: a.description ?? undefined,
      quantity: a.quantity ?? undefined,
    })),
    notes: job.comment ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}
