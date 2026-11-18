/**
 * Frappe CRM — constants.
 *
 * Frappe CRM is self-hosted, so INSTANCE_URL is supplied by the user at
 * credential-entry time and stored in credentials.extra.instanceUrl.
 * The constants below are only safe defaults used in test / dev.
 */

/** Default page size for list endpoints. */
export const DEFAULT_PAGE_SIZE = 20

/** Frappe REST resource prefix. */
export const RESOURCE_PREFIX = '/api/resource'

/** Fields to fetch for CRM Lead (contact proxy). */
export const LEAD_FIELDS = [
  'name',
  'first_name',
  'last_name',
  'lead_name',
  'email',
  'mobile_no',
  'phone',
  'job_title',
  'organization',
  'source',
  'status',
  'lead_owner',
  'industry',
  'website',
  'annual_revenue',
  'converted',
  'creation',
  'modified',
].join(',')

/** Fields to fetch for CRM Deal. */
export const DEAL_FIELDS = [
  'name',
  'lead_name',
  'first_name',
  'last_name',
  'organization',
  'email',
  'mobile_no',
  'phone',
  'status',
  'deal_owner',
  'probability',
  'annual_revenue',
  'deal_value',
  'expected_closure_date',
  'closed_date',
  'source',
  'industry',
  'website',
  'currency',
  'creation',
  'modified',
].join(',')

/** Fields to fetch for FCRM Note. */
export const NOTE_FIELDS = [
  'name',
  'title',
  'content',
  'reference_doctype',
  'reference_docname',
  'creation',
  'modified',
].join(',')

/** Fields to fetch for CRM Task (activity). */
export const TASK_FIELDS = [
  'name',
  'title',
  'description',
  'status',
  'priority',
  'assigned_to',
  'due_date',
  'start_date',
  'reference_doctype',
  'reference_docname',
  'creation',
  'modified',
].join(',')

/** Fields to fetch for CRM Organization (company). */
export const ORGANIZATION_FIELDS = [
  'name',
  'organization_name',
  'website',
  'no_of_employees',
  'annual_revenue',
  'industry',
  'territory',
  'currency',
  'creation',
  'modified',
].join(',')
