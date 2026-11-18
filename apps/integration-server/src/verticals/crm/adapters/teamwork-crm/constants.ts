/**
 * "Almost all endpoints will start with `https://example.teamwork.com/crm/api/v2/`."
 * (https://web.archive.org/web/20191122005536id_/https://developer.teamwork.com/crm/intro/getting-started)
 */
export const API_PATH = '/crm/api/v2'

/**
 * Every list endpoint documents `pageSize` as
 * `{"type":"integer","default":"20","maximum":200,"minimum":1}`
 * (e.g. https://web.archive.org/web/20200810124444id_/https://developer.teamwork.com/crm/api-reference/pipelines/get-pipelinesjson).
 */
export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 200
