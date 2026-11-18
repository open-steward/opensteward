/**
 * Teamhood is multi-tenant: each company account has its own API subdomain.
 *
 * "Base URL Format Use the following pattern for all API requests:
 * https://api-YOURTENANT.teamhood.com"
 * (https://teamhood.com/knowledge-base/integrations/open-api/api-examples/)
 *
 * Paths come from Teamhood's own OpenAPI document ("Teamhood API v1"), served
 * at https://api-demo.teamhood.com/swagger/v1/swagger.json.
 */
export const API_BASE_PATH = '/api/v1'
export const API_HOST_TEMPLATE = 'https://api-{tenant}.teamhood.com'
