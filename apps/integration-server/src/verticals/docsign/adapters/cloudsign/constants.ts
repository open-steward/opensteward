/**
 * CloudSign (GMO Cloud, Japan) Web API constants.
 *
 * Source: the Web API spec, 0.37.0
 * (https://api.swaggerhub.com/apis/CloudSign/cloudsign-web_api/0.37.0), and
 * the usage guide (https://help.cloudsign.jp/ja/articles/2681259).
 */

/** Production host: spec `servers` "https://api.cloudsign.jp" ("プロダクション環境"). */
export const API_BASE_URL = 'https://api.cloudsign.jp'

/**
 * Token endpoint. The usage guide: "アクセストークンは以下への POST で取得できます。
 * URL：https://api.cloudsign.jp/token パラメータ：client_id={CLIENT_ID}".
 */
export const TOKEN_URL = 'https://api.cloudsign.jp/token'

export const DEFAULT_PAGE_SIZE = 50
/**
 * Rows per page of `GET /documents`. The endpoint takes `page` and no size
 * parameter: "1 ページあたり最大 100 件のデータを取得"
 * (https://api.swaggerhub.com/apis/CloudSign/cloudsign-web_api/0.37.0).
 */
export const DOCUMENTS_PAGE_SIZE = 100
