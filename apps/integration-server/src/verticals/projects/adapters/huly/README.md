# Huly adapter

Huly REST API → canonical projects schema.

Auth: **api_key**. The workspace API token from Settings → API Tokens is sent as a Bearer token.
The Connect Link form collects the token and the REST "Base URL" shown on the same page
(`<transactor>/api/v1`). `exchangeCredentials` stores them as `credentials.accessToken` and
`credentials.extra.apiBaseUrl`, and reads the workspace UUID from the token's `workspace` claim into
`credentials.extra.workspaceId`. A connection missing either extra field refuses every read with 501.

Endpoint: `GET {apiBaseUrl}/find-all/{workspaceId}?class=&query=<json>&options=<json>`.

## Model notes

- Workspace: the connection's workspace. The token is bound to one, and its UUID is both id and name.
- Projects: `tracker:class:Project` spaces, archived ones included (`showArchived: true`). `owners[0]`
  is an AccountUuid; `ownerId` is the member Person whose `personUuid` it is (one `$in` lookup per page),
  omitted when no member matches. The raw uuid is kept in `metadata.ownerAccountUuid`.
- Tasks: `tracker:class:Issue` in the project's space. Status is a reference to an IssueStatus
  document, so the canonical status is `unknown` and the reference is kept in `metadata.statusRef`.
- Comments: `chunter:class:ChatMessage` documents attached to the issue (`attachedTo`), sent with
  `showArchived: true` so messages in archived projects are not dropped. `createdBy` is a PersonId (a
  social identity); `authorId` is the Person its `contact:class:SocialIdentity` is attached to (one `$in`
  lookup per page), and an unresolvable author throws.
- Users: `contact:mixin:Employee` documents. Email lives in separate Channel documents and is not read.
- Paging: `find-all` has no offset. Lists are walked by key on `modifiedOn` through `pageByCursor`.
- Tags: not mapped. listTags/getTag auto-501.
- Webhooks: no documented delivery API. verifyWebhook/parseWebhookEvents are not implemented.

Refused: attachment content, time-tracking, user PII beyond name.
