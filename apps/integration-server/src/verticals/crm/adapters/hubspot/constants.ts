export const HUBSPOT_BASE_URL = 'https://api.hubapi.com'
export const HUBSPOT_AUTH_URL = 'https://app.hubspot.com/oauth/authorize'
export const HUBSPOT_TOKEN_URL = 'https://api.hubapi.com/oauth/v1/token'

export const HUBSPOT_CONTACT_PROPERTIES =
  'firstname,lastname,email,phone,jobtitle,company'
export const HUBSPOT_COMPANY_PROPERTIES =
  'name,domain,phone,description,numberofemployees'
export const HUBSPOT_DEAL_PROPERTIES =
  'dealname,amount,closedate,dealstage,pipeline,hubspot_owner_id,hs_probability'
export const HUBSPOT_TASK_PROPERTIES =
  'hs_task_subject,hs_task_body,hs_task_due_date,hs_task_status,hubspot_owner_id'
export const HUBSPOT_NOTE_PROPERTIES =
  'hs_note_body,hubspot_owner_id,hs_timestamp'

/** Default HubSpot scopes — used when the adapter is constructed without
 *  an explicit scopes config. Operators can override per platform via
 *  /platforms/crm/hubspot or per Connect Link via the mint form. */
export const DEFAULT_HUBSPOT_SCOPES: readonly string[] = [
  'crm.objects.contacts.read',
  'crm.objects.contacts.write',
  'crm.objects.companies.read',
  'crm.objects.companies.write',
  'crm.objects.deals.read',
  'crm.objects.deals.write',
  'crm.schemas.deals.read',
]

/**
 * HubSpot's hard ceiling on `limit` for CRM v3 list endpoints.
 *
 * Above this the API refuses the request outright rather than clamping:
 *   400 VALIDATION_ERROR — "You can only request at most 100 objects in one
 *   request." context: { limit: ["500"] }
 *
 * 500 is the sync worker's default page size, so every HubSpot sync job failed
 * on its first request until this was declared.
 */
export const MAX_HUBSPOT_PAGE_SIZE = 100
