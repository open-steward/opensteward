/**
 * Concord REST API (https://api.doc.concordnow.com/concord-openapi-bundled.yaml):
 *   "The API is accessible from:
 *    + https://uat.concordnow.com/api/rest/1/ - sandbox
 *    + https://api.concordnow.com/api/rest/1/ - production"
 */
export const API_BASE_URL = 'https://api.concordnow.com/api/rest/1'

/**
 * Only used when a caller names no limit (the router always sends one).
 * `numberOfItemsByPage` has no documented default or maximum; 25 is the
 * AgreementListDto example ("Maximum number of items in a single page",
 * example: 25).
 */
export const DEFAULT_PAGE_SIZE = 25

/**
 * `statuses` is a required filter of ListAgreements. Envelopes are every
 * agreement stage except templates (`TEMPLATE`, `TEMPLATE_AUTO`), invitations
 * (`NEGO_INVITE` - "Invitation to a negotiation") and the trash (`TRASHED`).
 */
export const ENVELOPE_STATUSES = [
  'DRAFT',
  'VALIDATION',
  'NEGOTIATION',
  'SIGNING',
  'UNKNOWN_CONTRACT',
  'FUTURE_CONTRACT',
  'CURRENT_CONTRACT',
  'COMPLETED_CONTRACT',
  'COMPLETED_CANCEL_CONTRACT',
  'COMPLETED_CONTRACT_RENEWABLE',
  'BROKEN',
] as const

/**
 * "`TEMPLATE` - Template, Non-automated agreement template."
 * "`TEMPLATE_AUTO` - Template, Automated agreement template."
 */
export const TEMPLATE_STATUSES = ['TEMPLATE', 'TEMPLATE_AUTO'] as const
