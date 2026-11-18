/**
 * Peoplevox WMS SOAP API constants.
 *
 * Auth: clientId + username + password via SOAP Authenticate call.
 * Protocol: SOAP 1.2 over HTTPS.
 * Base host: wms.peoplevox.net (tenant-scoped by clientId path segment).
 */

/** Base host — tenant path is /{clientId}/resources/integrationservicev4.asmx */
export const SOAP_HOST = 'https://wms.peoplevox.net'
export const SOAP_PATH_SUFFIX = '/resources/integrationservicev4.asmx'
export const SOAP_NAMESPACE = 'http://www.peoplevox.net/'

/** Maximum records per GetData call (Peoplevox hard cap). */
export const DEFAULT_PAGE_SIZE = 200
export const MAX_PAGE_SIZE = 1000
