/**
 * Vendasta CRM API constants.
 *
 * REST base (gRPC-Gateway JSON over HTTP):
 *   Production: https://prod.apigateway.co/grpc
 *   Demo:       https://demo.apigateway.co/grpc
 *
 * Auth: OAuth2 Authorization Code flow.
 * Docs: https://developers.vendasta.com/platform/iyzxipdhj3szx-crm-rest-ap-is
 * OpenAPI spec: https://github.com/vendasta/api-gateway-docs/tree/master/openapi/crm
 */

export const VENDASTA_PROD_BASE_URL = 'https://prod.apigateway.co/grpc'
export const VENDASTA_DEMO_BASE_URL = 'https://demo.apigateway.co/grpc'

export const VENDASTA_AUTH_URL = 'https://sso-api-prod.apigateway.co/oauth2/auth'
export const VENDASTA_TOKEN_URL = 'https://sso-api-prod.apigateway.co/oauth2/token'

export const VENDASTA_DEMO_AUTH_URL = 'https://sso-api-demo.apigateway.co/oauth2/auth'
export const VENDASTA_DEMO_TOKEN_URL = 'https://sso-api-demo.apigateway.co/oauth2/token'

/** CRM endpoint paths (appended to the base URL). All are HTTP POST. */
export const VENDASTA_CRM_CONTACT_LIST = '/v1/crm/contact/list'
export const VENDASTA_CRM_CONTACT_GET = '/v1/crm/contact/get-multi'
export const VENDASTA_CRM_CONTACT_CREATE = '/v1/crm/contact/create'
export const VENDASTA_CRM_CONTACT_UPDATE = '/v1/crm/contact/update'
export const VENDASTA_CRM_CONTACT_DELETE = '/v1/crm/contact/delete'

export const VENDASTA_CRM_COMPANY_LIST = '/v1/crm/company/list'
export const VENDASTA_CRM_COMPANY_GET = '/v1/crm/company/get-multi'
export const VENDASTA_CRM_COMPANY_CREATE = '/v1/crm/company/create'
export const VENDASTA_CRM_COMPANY_UPDATE = '/v1/crm/company/update'
export const VENDASTA_CRM_COMPANY_DELETE = '/v1/crm/company/delete'

export const VENDASTA_CRM_OPPORTUNITY_LIST = '/v1/crm/opportunity/list'
export const VENDASTA_CRM_OPPORTUNITY_GET = '/v1/crm/opportunity/get-multi'
export const VENDASTA_CRM_OPPORTUNITY_CREATE = '/v1/crm/opportunity/create'
export const VENDASTA_CRM_OPPORTUNITY_UPDATE = '/v1/crm/opportunity/update'
export const VENDASTA_CRM_OPPORTUNITY_DELETE = '/v1/crm/opportunity/delete'

export const VENDASTA_CRM_PIPELINE_LIST = '/v1/crm/pipeline/list'
export const VENDASTA_CRM_PIPELINE_GET = '/v1/crm/pipeline/get-multi'

/**
 * Not in the /grpc CRM spec (it has no /v1/crm/activity/* path). Only the
 * activity/note write methods still use it; they are out of scope here.
 */
export const VENDASTA_CRM_ACTIVITY_LIST = '/v1/crm/activity/list'

/**
 * CRM External API servers (crm.json `servers`: "https://prod.apigateway.co/org"
 * "Production", "https://demo.apigateway.co/org" "Demo"). Lists activities via
 * ListCrmRecords: POST /list/{namespace}/{resourceTypeCode}.
 * https://raw.githubusercontent.com/vendasta/api-gateway-docs/master/openapi/crm/crm.json
 */
export const VENDASTA_ORG_PROD_BASE_URL = 'https://prod.apigateway.co/org'
export const VENDASTA_ORG_DEMO_BASE_URL = 'https://demo.apigateway.co/org'

export const VENDASTA_DEFAULT_PAGE_SIZE = 25

/**
 * Default OAuth2 scopes requested during authorization.
 * Covers read+write for contacts, companies, and opportunities (deals/pipelines).
 */
export const DEFAULT_VENDASTA_SCOPES: readonly string[] = [
  'crm.contact',
  'crm.company',
  'crm.opportunity',
  // The /org CRM External API (activities) declares a single OAuth2 scope:
  // "customers": "Allows the application to manage the customers for the
  // business location(s) that you manage" (crm.json securitySchemes).
  'customers',
]
