# Follow Up Boss CRM Adapter

Docs: https://docs.followupboss.com/

## Auth

HTTP Basic Authentication — API key as username, empty password.
Obtain your API key from Admin → API in your Follow Up Boss account.

## Coverage

| Resource   | Operations              |
|------------|-------------------------|
| Contacts   | list, get, create, update, delete |
| Deals      | list, get, create, update, delete |
| Notes      | list, get, create, update, delete |
| Pipelines  | list, get                |
| Activities | list, get, create, update, delete |

## Unsupported Resources

**Companies** — Follow Up Boss does not expose a first-class company/account
resource in its REST API. The platform is contact-centric; there is no
`/companies` or `/accounts` endpoint. The registry returns HTTP 501 for all
company operations on this adapter. A `transform/company.ts` file is therefore
not present and should not be created.
