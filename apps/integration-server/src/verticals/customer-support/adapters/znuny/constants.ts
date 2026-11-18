/**
 * Znuny REST API constants.
 *
 * Znuny is a self-hosted OTRS fork. The instance URL is provided by the tenant
 * at credential-entry time (e.g. https://helpdesk.example.com). The GenericInterface
 * web service is typically deployed as "GenericTicketConnectorREST" on the path
 * /otrs/nph-genericinterface.pl/Webservice/<name>/.
 *
 * Docs: https://doc.znuny.org/znuny/admin/webservices/examples/GenericTicketConnectorREST/
 */

/** Path appended to the tenant's instanceUrl to reach the REST web service. */
export const WS_PATH = '/otrs/nph-genericinterface.pl/Webservice/GenericTicketConnectorREST'

/**
 * Maximum number of ticket IDs returned by a single TicketSearch call.
 * Znuny does not enforce a hard cap but we limit to 100 to stay safe.
 */
export const DEFAULT_PAGE_SIZE = 100
