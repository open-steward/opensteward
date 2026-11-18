// No OAuth2 endpoints. A full authorization-code flow used to point at
// `demo.1c.ru/oauth/{authorize,token}`; both answer 404 with an HTML SPA page
// (re-probed 2026-09-15), as does `demo.1c.ru/odata/standard.odata/`. That is
// a vendor demo site, not an identity provider, and no customer could have
// completed the flow. 1C is installed per customer, so there is no central
// host for one to live on.
export {}
