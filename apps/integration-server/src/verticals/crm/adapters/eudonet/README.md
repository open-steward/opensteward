# Eudonet CRM Adapter

Docs: http://demo.eudonet.com/eudoapi/eudoapidoc/swaggerui/

## Auth

Eudonet uses a subscriber + user credential model. A short-lived token is obtained
by `POST /Authenticate/Token` and passed as the `x-auth` header on every subsequent
request.

The Connect Link form collects six fields:

| Field              | Description                                              |
|--------------------|----------------------------------------------------------|
| subscriberLogin    | Organisation-level login provided by Eudonet             |
| subscriberPassword | Organisation-level password                              |
| baseName           | Database / tenant name (BaseName)                        |
| userLogin          | Individual user login within the database                |
| userPassword       | Individual user password                                 |
| instanceUrl        | Base URL of your instance, e.g. `https://my.eudonet.com/EudoAPI` |

## Coverage

| Resource   | Implemented  | Notes |
|------------|--------------|-------|
| Contacts   | Yes (CRUD)   | Tab 100 |
| Companies  | Yes (CRUD)   | Tab 200 |
| Deals      | Yes (CRUD)   | Tab 300 |
| Notes      | Yes (CRUD)   | Tab 500 |
| Activities | No           | See below |
| Pipelines  | No           | No standard pipeline/stage resource in the API |

## Unsupported resources

### Activities

Eudonet has no standard activity table. Activity-like data (calls, meetings, tasks)
lives in **custom tables** that are configured per installation and vary in schema
between tenants. Because there is no predictable DescId layout to map to the
canonical `Activity` schema, `transform/activity.ts` is intentionally absent.

The registry returns HTTP 501 automatically for any unimplemented method, so no stub
transform is needed.

### Pipelines

Eudonet does not expose a standard pipeline or stage resource via EudoAPI.
