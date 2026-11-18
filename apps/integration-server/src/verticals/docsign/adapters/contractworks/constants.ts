/**
 * ContractWorks (Contracting.Works) API constants.
 *
 * The REST API (writes) and GraphQL API (reads) are both Azure-hosted and
 * require a per-tenant base URL of the form:
 *
 *   https://<host>/client/<clientId>/<entity>/Upsert   (REST)
 *   https://<graphql-host>/client/<clientId>/graphql   (GraphQL)
 *
 * The test/example environment uses the hosts below. Production clients
 * are given their own tenant-specific host.
 *
 * Auth is a bearer token; there is no OAuth2 PKCE flow. Users supply a
 * bearer token + tenant (client) ID via the Connect Link form.
 */
export const API_BASE_HOST = 'https://contracting-extest-clientapi.azurewebsites.net'
export const GRAPHQL_BASE_HOST = 'https://contracting-extest-clientapi-graphql.azurewebsites.net'
export const DEFAULT_PAGE_SIZE = 100
