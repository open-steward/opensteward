# Gainsight NXT Adapter

Docs: https://support.gainsight.com/gainsight_nxt/API_and_Developer_Docs

## Auth

API key authentication via the `Accesskey` request header.  
Set `credentials.accessToken` to your Gainsight API Access Key (generated under
Administration > Connectors 2.0 > API Access Key).

An optional tenant subdomain (`credentials.extra.domain`) is required for CTA/Activity
endpoints. The Company and People APIs use fixed `gainsightcloud.com` subdomains.

## Coverage

| Resource   | Implemented      | Notes |
|------------|------------------|-------|
| Contacts   | Yes (CRUD)       | Gainsight People API (`/v1/peoplemgmt/v1.0/people`) |
| Companies  | Yes (CRUD+delete)| Gainsight Company API (`/v1/data/objects/Company`) |
| Activities | Yes (CRUD)       | Gainsight CTA (Cockpit) API |
| Notes      | No               | No standalone Notes object in Gainsight NXT REST API |
| Deals      | No               | No native Deal/Renewal Center mapping in Gainsight NXT REST API |
| Pipelines  | No               | No pipeline concept in Gainsight NXT CRM |

## Unsupported resources

`note` and `deal` transform files are intentionally absent:

- **Notes** — Gainsight NXT does not expose a standalone Notes REST endpoint. Timeline
  entries and comments exist only as sub-resources inside the Gainsight UI (Cockpit) and
  are not accessible via the documented public REST API.
- **Deals** — Gainsight's Renewal Center (the closest analog to a deal pipeline) is an
  add-on module with a separate, non-standard API that is not part of the core NXT REST
  surface. No canonical Deal mapping is possible without a Renewal Center-specific client.

The registry returns HTTP 501 automatically for any unimplemented method, so no stub
transforms are required.
