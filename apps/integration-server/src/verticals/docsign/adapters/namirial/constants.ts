/**
 * Namirial eSignAnyWhere REST API v6 constants.
 *
 * Swagger: https://demo.esignanywhere.net/swagger/jsons/swagger.v6.json
 * (`"basePath": "/api"`, every route under `/v6/…`, no `host`). The host is
 * per environment — "On our Shared SaaS environments (including
 * saas.esignanywhere.net, www.significant.com and others)"
 * (https://namirial.atlassian.net/wiki/pages/viewpage.action?pageId=91989366),
 * plus the demo environment and on-premise installs — so it is collected per
 * connection and never hard-coded here.
 */
export const API_BASE_PATH = '/api'

export const DEFAULT_SCOPES: string[] = []
