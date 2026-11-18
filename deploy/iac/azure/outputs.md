# Outputs → overlay placeholder mapping

The deployment outputs live in [`main.bicep`](./main.bicep) (Bicep keeps outputs
in the template). This file documents each one and where it goes in
[`deploy/helm/overlays/azure-values.yaml`](../../helm/overlays/azure-values.yaml).

Read outputs after a deploy with:

```sh
az deployment group show -g <RG> -n main --query properties.outputs -o json
```

(or just run [`deploy.sh`](./deploy.sh), which prints the non-secret ones).

| Bicep output | Overlay field / placeholder | Notes |
| --- | --- | --- |
| `managedIdentityClientId` | `serviceAccount.annotations.[azure.workload.identity/client-id]` → `<MANAGED_IDENTITY_CLIENT_ID>` | The clientId (GUID) of the user-assigned MI ESO federates to. |
| `tenantId` | `secrets.externalSecrets.azure.tenantId` → `<TENANT_ID>` | AAD tenant. |
| `keyVaultUri` | `secrets.externalSecrets.azure.vaultUrl` → `https://<KEYVAULT_NAME>.vault.azure.net` | Full vault URI; paste verbatim. |
| `keyVaultName` | — | The bare `<KEYVAULT_NAME>` if you prefer to build the URL yourself. |
| `appSecretName` | `secrets.externalSecrets.remoteSecretName` | `opensteward-app-secrets` by default. |
| `aksClusterName` + `resourceGroupName` | — | `az aks get-credentials -g <resourceGroupName> -n <aksClusterName>`. |
| `aksOidcIssuerUrl` | — | Informational; issuer of the federated credential. |
| `chartServiceAccountName` | — | `<release>-opensteward`; confirms the KSA the federation trusts. Install the chart with this release/namespace. |
| `federationSubject` | — | `system:serviceaccount:<ns>:<ksa>`; the federated-credential subject. |
| `postgresFqdn` | (builds `opensteward-db` / DATABASE_URL) | Flexible Server FQDN. |
| `databaseUrlTemplate` | K8s secret `opensteward-db` key `DATABASE_URL` | Password is **elided** (`<POSTGRES_PASSWORD>`). Substitute the password you supplied, then create the secret. |
| `postgresAdminUser`, `postgresDatabaseName` | — | For assembling DATABASE_URL yourself. |

## Not in this template (overlay still needs them)

| Overlay field / placeholder | Where it comes from |
| --- | --- |
| `redis.url` → `<AZURE_CACHE_NAME>` | Not created by this template. Provision Azure Cache for Redis separately (or set `redis.enabled: false` for trials) and paste the `rediss://…:6380` endpoint. |
| `ingress.hosts[].host`, `publicUrls.*` | Your real DNS names. |
| `ingress.tls.certManager.clusterIssuer` (`letsencrypt-prod`) | Created by cert-manager (prereq) — e.g. a `ClusterIssuer` you apply after install. |

## Secrets intentionally NOT output

- The app secrets JSON (`JWT_SECRET` / `SESSION_SECRET` / `STORE_SECRET` /
  `ADMIN_SECRET`) — they live only in Key Vault; ESO reads them in-cluster.
- The Postgres password and the fully-assembled `DATABASE_URL` — never surfaced
  through a deployment output. `deploy.sh` assembles the URL locally and (with
  `--create-db-secret`) writes the K8s secret without printing it.
