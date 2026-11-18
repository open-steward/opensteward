/**
 * SYSPRO OData service constants.
 *
 * SYSPRO 8 exposes data via an OData 4.0 service.
 * Base URL pattern (on-premise): https://{host}/SYSPRO8OData/SYSPROOData/{companyId}
 * Base URL pattern (cloud):      https://{cloudDomain}/SYSPRO8OData/SYSPROOData/{companyId}
 *
 * The host, company ID, and credentials are supplied at runtime via Credentials.extra.
 */

/** Max records SYSPRO OData returns in one call (server-side limit: 5000). */
export const DEFAULT_PAGE_SIZE = 100

/** OData query options key names. */
export const ODATA_TOP = '$top'
export const ODATA_SKIP = '$skip'
export const ODATA_EXPAND = '$expand'
export const ODATA_FILTER = '$filter'
export const ODATA_COUNT = '$count'
