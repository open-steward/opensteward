import { isIso3166Alpha2 } from '@opensteward/shared'
import type { Address } from '../../../schema/shared'
import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import type { CigoJob, CigoJobResponse } from '../types'

/**
 * The job inside a "Retrieve a Job" response (`GET /jobs/id/{jobID}`), which
 * nests it under `job`. A body without a `job.job_id` is not a job.
 */
export function jobOf(raw: CigoJobResponse): CigoJob & { job_id: string } {
  const job = raw.job
  if (!job || typeof job.job_id !== 'string' || job.job_id === '') {
    throw new Error('CIGO Tracker returned a job response without job.job_id')
  }
  return job as CigoJob & { job_id: string }
}

/**
 * The job's delivery address. CIGO documents one `address` string ("275
 * Notre-Dame St. East, Montreal, QC, H2Y 1C6"), not separate lines, so it is
 * street1 as given; `apartment` is street2. Country and state come from the
 * geocoder ("ISO 3166-1 code", "ISO 3166-2 code (principal subdivision)"),
 * and a country that is not an alpha-2 code is left out.
 */
export function jobAddress(job: CigoJob): Address | undefined {
  const geo = job.post_staging?.geocoding
  const country = geo?.country_code
  const name = [job.first_name, job.last_name].filter((s): s is string => !!s).join(' ')
  const addr: Address = {
    name: name || undefined,
    street1: job.address ?? undefined,
    street2: job.apartment ?? undefined,
    state: geo?.subdivision_code ?? undefined,
    postalCode: job.postal_code ?? undefined,
    country: country && isIso3166Alpha2(country) ? country : undefined,
    phone: job.phone_number ?? undefined,
    email: job.email ?? undefined,
  }
  return Object.values(addr).some((v) => v !== undefined) ? addr : undefined
}

/** The documented job statuses, onto the shipment lifecycle. */
function mapStatus(status: string | null | undefined): ShipmentStatus {
  switch (status) {
    // staging: "Jobs in this state cannot be routed and have to be reviewed in the Import Tool."
    // new: "the base state of a job that can be or has been added to an Itinerary's route"
    case 'staging':
    case 'new':
      return 'PENDING'
    // "Once an operator selects 'On Route' in the mobile app"
    case 'in progress':
      return 'OUT_FOR_DELIVERY'
    case 'completed':
      return 'DELIVERED'
    case 'incomplete':
    case 'damaged':
    case 'partially completed':
      return 'EXCEPTION'
    case 'cancelled':
      return 'CANCELLED'
    // `resolved` marks "that a prior mishap has been resolved", not where the goods are.
    default:
      return 'UNKNOWN'
  }
}

/**
 * A CIGO job as a shipment. Job datetimes (`create_datetime`,
 * `progress.end_datetime`) are documented without a timezone
 * ("2019-04-28 18:32:41"), so they stay in `metadata` rather than being read
 * as UTC; so do weights and values, which carry no documented unit or
 * currency.
 */
export function transformShipment(raw: CigoJobResponse): Shipment {
  const job = jobOf(raw)
  return {
    id: job.job_id,
    status: mapStatus(job.status),
    trackingNumber: job.post_staging?.tracking?.tracking_number ?? undefined,
    reference: job.reference_id ?? undefined,
    destinationAddress: jobAddress(job),
    notes: job.comment ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}
