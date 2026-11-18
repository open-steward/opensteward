// https://api.shippypro.com/docs/v1.json (info.description, "Versioning"):
//   "The current version of ShippyPro API is `v1`. This is the endpoint to reach:
//    https://api.shippypro.com/v1"
// Every operation is its own path under it (`POST /v1/<Method>`), and the body
// carries the same name: "you need to send a well-formed JSON POST request
// containing Method and Params parameters."
export const SHIPPYPRO_API_BASE = 'https://api.shippypro.com/v1'

// "You can find or generate your **API Key** under the API section
//  [Here](https://www.shippypro.com/panel/apikeys.html) in ShippyPro"
export const SHIPPYPRO_DASHBOARD_URL = 'https://www.shippypro.com/panel/apikeys.html'

// "There is a Rate-Limiting of 20 API requests every 10 seconds."
export const RATE_LIMIT_RPS = 10
