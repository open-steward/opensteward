/**
 * SAP Sales Cloud Version 2 — API constants.
 *
 * Base URL pattern: https://<tenant>.crm.cloud.sap/sap/c4c/api/v1
 * Token endpoint (technical user, HTTP Basic): https://<tenant>.crm.cloud.sap/sap/c4c/api/v1/iam-service/token
 *
 * Docs: https://api.sap.com/package/SAPSalesServiceCloudV2/rest
 *
 * Service names verified against the SAP Business Accelerator Hub
 * (api.sap.com/package/SAPSalesServiceCloudV2/rest):
 *   SalesSvcCloudV2_individualCustomerService → individual-customer-service/individualCustomers
 *   SalesSvcCloudV2_accountService           → account-service/accounts
 *   SalesSvcCloudV2_opportunity              → opportunity-service/opportunities
 *   SalesSvcCloudV2_taskService              → task-service/tasks
 *   SalesSvcCloudV2_appointment              → appointment-service/appointments
 *
 * Notes: SAP Sales Cloud V2 does not expose a standalone "note-service".
 * Notes (free-form text) are stored as sub-resources on opportunities and
 * accounts:  /opportunity-service/opportunities/{id}/notes
 * This adapter surfaces notes via the opportunity sub-collection path.
 *
 * Sales phases: confirmed via the opportunity-service lifecycle-status codes.
 * A dedicated salesPhase configuration service is available at:
 *   /sales-phase-service/salesPhases  (read-only configuration list)
 */

/**
 * Token endpoint appended to the tenant base URL. V2 has no browser OAuth
 * authorization endpoint: a technical user authenticates here with HTTP Basic
 * and receives a short-lived bearer token.
 * Full URL = `${tenantUrl}${SAP_SALES_CLOUD_TOKEN_PATH}`
 */
export const SAP_SALES_CLOUD_TOKEN_PATH = '/sap/c4c/api/v1/iam-service/token'

/** API base path appended to the tenant base URL. */
export const SAP_SALES_CLOUD_API_BASE = '/sap/c4c/api/v1'

/**
 * REST service path segments (relative to API base).
 *
 * These paths are derived from the service names published on the SAP
 * Business Accelerator Hub for SAP Sales Cloud and SAP Service Cloud V2
 * (SAPSalesServiceCloudV2).  Use the kebab-case service name followed by
 * the lower-camelCase collection name, matching the published OpenAPI specs.
 */

/** SalesSvcCloudV2_individualCustomerService — contacts / persons. */
export const SAP_INDIVIDUAL_PATH = '/individual-customer-service/individualCustomers'

/** SalesSvcCloudV2_accountService — corporate accounts / companies. */
export const SAP_ACCOUNT_PATH = '/account-service/accounts'

/** SalesSvcCloudV2_opportunity — deals / opportunities. */
export const SAP_OPPORTUNITY_PATH = '/opportunity-service/opportunities'

/**
 * SalesSvcCloudV2_taskService — activities modelled as tasks.
 *
 * SAP Sales Cloud V2 does NOT expose a generic "activity-service/activities"
 * endpoint.  Activities are split into two separate services:
 *   • task-service/tasks        (tasks, to-dos)
 *   • appointment-service/appointments (meetings, phone-call records)
 *
 * This adapter maps the canonical "Activity" resource to tasks, which are
 * the most universally available type.  For appointment-specific use cases,
 * override the path constant at runtime.
 */
export const SAP_TASK_PATH = '/task-service/tasks'

/**
 * Notes sub-resource path template.
 *
 * SAP Sales Cloud V2 does NOT provide a standalone flat "note-service/notes"
 * collection.  Notes are sub-resources attached to parent objects:
 *   /opportunity-service/opportunities/{id}/notes
 *   /account-service/accounts/{id}/notes
 *
 * SAP_NOTE_PATH is the base sub-collection suffix appended to the parent
 * resource path.  The adapter constructs the full URL from the parent
 * context; for flat list/get operations the opportunity parent is assumed.
 *
 * Flat list operations use:  /opportunity-service/opportunities/{id}/notes
 * Callers that need cross-parent notes should supply the explicit parent path.
 */
export const SAP_NOTE_SUFFIX = '/notes'

/** SalesSvcCloudV2 sales-phase configuration list (read-only). */
export const SAP_SALES_PHASE_PATH = '/sales-phase-service/salesPhases'

/**
 * Default OAuth2 scopes for SAP Sales Cloud V2.
 * SAP uses openid as the primary scope; granular permissions are
 * controlled via the IAM configuration in the tenant.
 */
export const DEFAULT_SAP_SCOPES: readonly string[] = [
  'openid',
]

/** Default page size for list requests (SAP max is 1000). */
export const SAP_DEFAULT_PAGE_SIZE = 50
