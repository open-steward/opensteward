/**
 * OTOBO REST API constants.
 *
 * OTOBO exposes its API through the Generic Interface at:
 *   https://{server}/otobo/nph-genericinterface.pl/Webservice/{webservice_name}/{Operation}
 *
 * The webservice name is user-configured in the OTOBO admin panel under
 * "Processes & Automation → Web Services". The commonly used name for the
 * standard ticket connector is "GenericTicketConnectorREST".
 *
 * Auth: credentials (UserLogin + Password) are passed as JSON body fields on
 * every request, or as query params on GET requests. There is no separate
 * sandbox URL — customers point at their own OTOBO instance.
 */

/** Caller page size when a list call names no limit. */
export const DEFAULT_PAGE_SIZE = 100

/**
 * Default webservice name.  Tenants that named their webservice differently
 * must supply a custom value via the credential form (websvcName field).
 */
export const DEFAULT_WEBSERVICE_NAME = 'GenericTicketConnectorREST'
