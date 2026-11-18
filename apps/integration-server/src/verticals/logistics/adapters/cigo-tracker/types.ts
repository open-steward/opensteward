/**
 * CIGO Tracker Public API response shapes, from the vendor's OpenAPI 3.0 spec
 * at https://app.cigotracker.com/reference/cigo-swagger.json (rendered at
 * https://app.cigotracker.com/api). Only the fields this adapter reads are
 * typed; every response is kept whole in `metadata`.
 */

/** `POST /jobs/search`, "Search Jobs Response". */
export interface CigoSearchJobsResponse {
  statusCode?: number
  status?: string
  /** "Matching count and list of Job API IDs that are in status `staging`" */
  in_staging?: { count?: number; ids?: string[] } | null
  /** "Matching count and list of Job API IDs that are in statuses after `staging`" */
  post_staging?: { count?: number; ids?: string[] } | null
}

/** `job.post_staging.geocoding`, "Geocoding information". */
export interface CigoGeocoding {
  validity?: string | null
  /** "ISO 3166-2 code (principal subdivision - e.g. province or state)" */
  subdivision_code?: string | null
  /** "ISO 3166-1 code (country code)" */
  country_code?: string | null
  timezone?: string | null
}

/** `job` in "Retrieve a Job" (`GET /jobs/id/{jobID}`). */
export interface CigoJob {
  /** "Job ID" */
  job_id?: string | null
  stop_type?: string | null
  job_type?: string | null
  /** "Potential statuses are `staging`, `new`, `in progress`, `damaged`, `completed`, `resolved`, `incomplete`, `cancelled` and `partially completed`" */
  status?: string | null
  post_staging?: {
    tracking?: {
      url?: string | null
      /** "Full hyphenated tracking number (16 or 18 characters)" */
      tracking_number?: string | null
      [key: string]: unknown
    } | null
    geocoding?: CigoGeocoding | null
    [key: string]: unknown
  } | null
  /** "Date (ISO-8601)"; `tbd` when no date is set. */
  date?: string | null
  first_name?: string | null
  last_name?: string | null
  phone_number?: string | null
  email?: string | null
  address?: string | null
  apartment?: string | null
  postal_code?: string | null
  comment?: string | null
  reference_id?: string | null
  [key: string]: unknown
}

/** One entry of `actions` in "Retrieve a Job". */
export interface CigoJobAction {
  /** "Action ID" */
  action_id?: string | null
  /** "Some Internal ID, such as SKU, Product Code, etc." */
  id?: string | null
  description?: string | null
  /** "Quantity (positive integer)" */
  quantity?: number | null
  [key: string]: unknown
}

/** The whole 200 body of "Retrieve a Job" (`GET /jobs/id/{jobID}`). */
export interface CigoJobResponse {
  statusCode?: number
  status?: string
  job?: CigoJob | null
  actions?: CigoJobAction[] | null
  related_on_route_stops?: Array<Record<string, unknown>> | null
  [key: string]: unknown
}
