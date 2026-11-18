/**
 * cobra CRM Cloud (cobra GmbH) API constants.
 *
 * Host: the published OpenAPI declares `servers: - url: https://api.cobra.de/v1`
 * (https://apis.cobra-hilfe.de/api-7858747.md), and the versioning guide gives
 * `https://api.cobra.de/v1/events/{id}` (https://apis.cobra-hilfe.de/doc-390696.md).
 * The adapter previously called https://api.cobra-crm.com/v1, a host that does
 * not resolve.
 */
export const BASE_URL = 'https://api.cobra.de/v1'

/**
 * "Every request requires the following HTTP headers: X-Integration-Name,
 * X-Integration-Provider and X-Cobra-TenantId. You can use "postman" for
 * X-Integration-Name, as X-Integration-Provider your company or project name"
 * (https://apis.cobra-hilfe.de/doc-431461.md). Both name this integration.
 */
export const INTEGRATION_NAME = 'OpenSteward'
export const INTEGRATION_PROVIDER = 'OpenSteward'

/** "Token lifetime is one hour." (https://apis.cobra-hilfe.de/doc-386341.md) */
export const TOKEN_LIFETIME_MS = 60 * 60 * 1000
