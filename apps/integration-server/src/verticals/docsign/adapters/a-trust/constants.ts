/**
 * The Signaturbox API's only documented server
 * (https://docs.a-trust.at/swagger/signaturbox.yaml: "servers: - url: https://testbox.a-trust.at");
 * every request example on https://docs.a-trust.at/apis/SignaturServer/templates
 * reads "Host: testbox.a-trust.at:443". Paths carry their own `/v2` prefix.
 */
export const API_BASE_URL = 'https://testbox.a-trust.at'
