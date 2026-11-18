/**
 * Modusign REST API constants.
 *
 * Modusign (by Modu Solutions) is a Korean e-signature provider.
 *
 * Base URL — the OpenAPI definition on every reference page
 * (e.g. https://developers.modusign.co.kr/reference/documentcontroller_getdocument.md)
 * declares a single server with no version segment:
 *   "servers": [{ "url": "https://api.modusign.co.kr", "description": "production" }]
 *
 * Auth — https://developers.modusign.co.kr/docs/api-key로-요청하기.md:
 *   "여기서 ID는 사용자의 이메일을, 패스워드에 해당하는 부분은 발급 받은
 *    API KEY로 사용합니다." — HTTP Basic, user = account email,
 *   password = API key.
 *
 * Docs: https://developers.modusign.co.kr/
 */
export const API_BASE_URL = 'https://api.modusign.co.kr'

export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 100
