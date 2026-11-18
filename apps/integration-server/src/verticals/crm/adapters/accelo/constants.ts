/**
 * Accelo API constants.
 *
 * Accelo is a multi-tenant SaaS platform where each customer has their own
 * deployment subdomain (e.g. mycompany.api.accelo.com). The deployment is
 * collected as part of the OAuth2 flow and stored in credentials.extra.
 *
 * Docs: https://api.accelo.com/docs/
 */

/** Build the per-deployment base URL. */
export function acceloBaseUrl(deployment: string): string {
  return `https://${deployment}.api.accelo.com/api/v0`
}

/** Build the per-deployment OAuth2 authorize URL. */
export function acceloAuthUrl(deployment: string): string {
  return `https://${deployment}.api.accelo.com/oauth2/v0/authorize`
}

/** Build the per-deployment OAuth2 token URL. */
export function acceloTokenUrl(deployment: string): string {
  return `https://${deployment}.api.accelo.com/oauth2/v0/token`
}

/** Default page size — Accelo max is 100. */
export const DEFAULT_PAGE_SIZE = 25

/**
 * Default OAuth2 scopes for CRM use cases.
 * Accelo uses write() to grant both read and write; read() is read-only.
 */
export const DEFAULT_ACCELO_SCOPES: readonly string[] = [
  'write(contacts)',
  'write(companies)',
  'write(prospects)',
  'write(activities)',
]

/**
 * Fields to request from the contacts endpoint.
 * Accelo returns a minimal set by default; request extras via _fields.
 */
export const ACCELO_CONTACT_FIELDS = 'id,firstname,surname,email,phone,mobile,company,date_created,date_modified,status'

/**
 * Fields to request from the companies endpoint.
 */
export const ACCELO_COMPANY_FIELDS = 'id,name,phone,website,date_created,date_modified,status'

/**
 * Fields to request from the prospects endpoint.
 */
export const ACCELO_PROSPECT_FIELDS = 'id,title,value,status,type,probability,manager_id,contact_id,company_id,date_created,date_modified'

/**
 * Fields to request from the activities endpoint.
 */
export const ACCELO_ACTIVITY_FIELDS = 'id,subject,body,medium,against_type,against_id,owner_id,date_created,date_started,date_modified,standing'
