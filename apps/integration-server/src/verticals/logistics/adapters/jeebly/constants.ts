// Jeebly is a MENA-region last-mile delivery platform headquartered in Dubai.
// API documentation: https://jeebly.com/technology/
export const JEEBLY_API_BASE = 'https://api.jeebly.com/v1/'

// Jeebly uses API key authentication — no OAuth2 flow.
export const JEEBLY_DASHBOARD_URL = 'https://portal.jeebly.com/settings/api'

// Jeebly's only published API spec (Swagger 2.0), linked from
// https://jeebly.com/technology/. Its host is rest.jeeblynow.com; the
// JEEBLY_API_BASE above does not resolve in DNS and is used only by the
// write methods createShipment and cancelOrder.
export const JEEBLY_SWAGGER_URL = 'https://rest.jeeblynow.com/api/v1/integrations/swagger/'
