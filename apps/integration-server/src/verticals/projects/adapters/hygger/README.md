# Hygger adapter

Every read method refuses with 501 NOT_SUPPORTED before sending anything.

API reference: the API Blueprint behind https://hygger.docs.apiary.io/
(raw: https://jsapi.apiary.io/apis/hygger.apib). It documents
`HOST: https://api.hygger.io/public-api/`, `Authorization: Bearer <token>`
(a token got by exchanging an `auth_code` at `POST /authorization`), and
offset/limit lists at `GET /boards`, `/tasks`, `/labels` and `/users`.

Why nothing is served:

- The live host rejects every documented read with
  "GET parameter company_id is required and must be abs int". The reference
  never names `company_id`, and the connection holds only a token.
- The reference documents no response body for boards, tasks, labels or users,
  so there are no documented fields to map.
- Comments and workspaces have no resource in the reference. Comments appear
  only as JSON-patch paths on `PATCH /tasks/{id}`. The company operations are
  writes only (`POST /companies`, `PATCH /users-companies/{id}`). The nearest
  workspace analogue, `GET /projects`, documents no response body and gets the
  same `company_id` 422 live.

No webhook API is documented.
