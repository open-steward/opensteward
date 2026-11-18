// Mylerz's merchant integration API. https://integration.mylerz.net/Help lists
// every route under this prefix ("GET api/Orders/GetWarehouses",
// "GET api/packages/GetPackageDetails?AWB={AWB}", ...). mobile.mylerz.net is the
// courier mobile-app API, not this one.
//
// The official Mylerz WooCommerce plugin (wordpress.org/plugins/mylerz, author
// "mylerz", v5.0.5, includes/mylerz-data.php) maps merchant country to host:
//   'EG' => 'https://integration.mylerz.net',
//   'TN' => 'https://integration.tunisia.mylerz.net', (also MA, DZ, JO)
// This adapter has no region key, so it serves the Egypt host only.
export const MYLERZ_HOST = 'https://integration.mylerz.net'
export const MYLERZ_API_BASE = `${MYLERZ_HOST}/api/`

// Same plugin, includes/mylerz-admin-hooks.php: `$url = $apiCountry[$country] . '/token';`
// POSTed as application/x-www-form-urlencoded with username, password and
// 'grant_type' => 'password'; the token is read from `access_token`.
export const MYLERZ_TOKEN_URL = `${MYLERZ_HOST}/token`

export const MYLERZ_DASHBOARD_URL = 'https://integration.mylerz.net/Help'

export const RATE_LIMIT_RPS = 10
