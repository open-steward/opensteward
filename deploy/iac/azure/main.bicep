// =============================================================================
// OpenSteward — Azure / AKS reference infrastructure (Bicep)
// =============================================================================
//
// REFERENCE / EXAMPLE IaC. It provisions exactly what the OpenSteward Helm
// per-cloud overlay (deploy/helm/overlays/azure-values.yaml) expects, and no
// more. Treat it as a starting point an operator forks and hardens — favour
// clarity and correctness over completeness.
//
// What this template creates:
//   - An AKS cluster with the OIDC issuer + Workload Identity enabled and the
//     app-routing add-on (managed ingress-nginx).
//   - Azure Database for PostgreSQL Flexible Server (+ an empty database).
//   - An Azure Key Vault and the 'opensteward-app-secrets' secret (JSON app
//     secrets) — see the secret-handling notes below.
//   - A user-assigned Managed Identity with (a) a federated identity credential
//     bound to the chart's Kubernetes ServiceAccount and (b) a 'Key Vault
//     Secrets User' role assignment on the vault.
//
// PREREQUISITES the operator installs in-cluster AFTER this deploys (NOT created
// here — they are Helm/kubectl concerns, not Azure resources):
//   - cert-manager           (issues the TLS certs the overlay references)
//   - External Secrets Operator (ESO) — the chart renders a ClusterSecretStore
//     that authenticates to the vault via Workload Identity and reads
//     'opensteward-app-secrets'.
//   The app-routing add-on below already brings managed ingress-nginx.
//
// SECRET HANDLING — READ THIS:
//   - 'opensteward-app-secrets' holds a JSON object: JWT_SECRET, SESSION_SECRET,
//     STORE_SECRET (and optionally ADMIN_SECRET). Its value is a @secure()
//     parameter — supply it out-of-band (see deploy.sh / main.bicepparam). It is
//     NEVER echoed in an output.
//   - STORE_SECRET encrypts data at rest. Generate it ONCE and NEVER change it.
//     Rotating it orphans every encrypted-at-rest value. Because the secret is a
//     parameter, an `az deployment ... --parameters appSecretsJson=...` that
//     passes a *different* STORE_SECRET WILL silently rotate it. Keep the value
//     stable across every redeploy (store it in a password manager / pipeline
//     secret and reuse it). See README "STORE_SECRET is forever".
//
// apiVersions are pinned to recent GA releases (see versions.json).
// =============================================================================

targetScope = 'resourceGroup'

// -----------------------------------------------------------------------------
// Parameters  (Bicep keeps "variables" inline as params — the defaults +
// @description below serve as the variables reference.)
// -----------------------------------------------------------------------------

@description('Azure region for all resources. Defaults to the resource group location.')
param location string = resourceGroup().location

@description('Short prefix for resource names. Lowercase letters/numbers; keep it short — names derive from it.')
@minLength(3)
@maxLength(12)
param namePrefix string = 'opensteward'

@description('Globally-unique suffix appended to names that need global uniqueness (Key Vault, Postgres). Defaults to a hash of the resource group id so redeploys are stable.')
@maxLength(8)
param uniqueSuffix string = substring(uniqueString(resourceGroup().id), 0, 6)

// --- Kubernetes / Helm consistency contract -----------------------------------
// These MUST match how the chart is installed. The Workload Identity federation
// subject is system:serviceaccount:<k8sNamespace>:<k8sServiceAccountName>.
// The chart's ServiceAccount name defaults to "<release>-opensteward"
// (opensteward.fullname). For release "os" that is "os-opensteward".

@description('Kubernetes namespace the chart is installed into (Helm --namespace).')
param k8sNamespace string = 'opensteward'

@description('Helm release name. The chart ServiceAccount is "<release>-opensteward".')
param helmReleaseName string = 'os'

@description('Override the chart ServiceAccount name. Leave empty to derive "<release>-opensteward" (the chart default).')
param k8sServiceAccountNameOverride string = ''

// --- AKS ----------------------------------------------------------------------
@description('Kubernetes version for the AKS control plane. Empty = let AKS pick the default GA version.')
param kubernetesVersion string = ''

@description('System node pool VM size.')
param systemNodeVmSize string = 'Standard_D4s_v5'

@description('System node pool node count.')
@minValue(1)
@maxValue(100)
param systemNodeCount int = 3

@description('OS disk size (GiB) for the system node pool.')
param systemNodeOsDiskSizeGb int = 64

// --- PostgreSQL Flexible Server ----------------------------------------------
@description('PostgreSQL administrator login.')
param postgresAdminUser string = 'osadmin'

@description('PostgreSQL administrator password. Supply out-of-band (NOT in source). Used only to build the server + the DATABASE_URL output.')
@secure()
@minLength(1)
param postgresAdminPassword string

@description('Name of the application database created on the server.')
param postgresDatabaseName string = 'opensteward'

@description('PostgreSQL major version.')
@allowed([
  '14'
  '15'
  '16'
])
param postgresVersion string = '16'

@description('Flexible Server compute SKU (e.g. Standard_B2s for trials, Standard_D2ds_v5 for prod).')
param postgresSkuName string = 'Standard_D2ds_v5'

@description('Flexible Server tier.')
@allowed([
  'Burstable'
  'GeneralPurpose'
  'MemoryOptimized'
])
param postgresTier string = 'GeneralPurpose'

@description('Storage size (GiB) for the Flexible Server.')
param postgresStorageSizeGb int = 64

@description('Allow public network access to Postgres and open the Azure-services firewall rule. Reference convenience ONLY — for production, deploy the server into a delegated subnet / private access and remove this.')
param postgresAllowPublicAccess bool = true

// --- Key Vault / app secrets --------------------------------------------------
@description('''
JSON object of app secrets stored under "opensteward-app-secrets". Keys:
JWT_SECRET, SESSION_SECRET, STORE_SECRET, and optionally ADMIN_SECRET.
Supply out-of-band (see deploy.sh, which generates a fresh JSON). STORE_SECRET
must be STABLE forever — passing a different value here rotates it and orphans
encrypted-at-rest data. Never commit a real value.''')
@secure()
// @minLength(1) makes a MISSING value fail fast. main.bicepparam reads this from
// an env var defaulting to '' — without this guard, a forgotten `export` would
// pass an empty string and silently OVERWRITE the vault secret (zeroing
// STORE_SECRET) on re-apply. Fail the deploy instead.
@minLength(1)
param appSecretsJson string

@description('Name of the Key Vault secret holding the JSON app secrets. The overlay sets externalSecrets ... remoteSecretName to this.')
param appSecretName string = 'opensteward-app-secrets'

@description('Enable Key Vault purge protection. Recommended on; required if you want soft-delete recovery guarantees.')
param keyVaultPurgeProtection bool = true

@description('Tags applied to every resource.')
param tags object = {
  'app.kubernetes.io/part-of': 'opensteward'
  managedBy: 'bicep-reference-iac'
}

// -----------------------------------------------------------------------------
// Derived names / locals
// -----------------------------------------------------------------------------

// Chart ServiceAccount name == opensteward.fullname == "<release>-opensteward"
// (unless overridden). This is the subject of the federated credential.
var ksaName = empty(k8sServiceAccountNameOverride) ? '${helmReleaseName}-opensteward' : k8sServiceAccountNameOverride
var federationSubject = 'system:serviceaccount:${k8sNamespace}:${ksaName}'

var aksName = '${namePrefix}-aks'
var identityName = '${namePrefix}-eso-id'
// Key Vault names: 3-24 chars, alphanumeric + hyphen, globally unique.
var keyVaultName = take('${namePrefix}-kv-${uniqueSuffix}', 24)
// Postgres server names: globally unique, lowercase.
var postgresServerName = toLower('${namePrefix}-pg-${uniqueSuffix}')
var dnsPrefix = '${namePrefix}-aks'

// 'Key Vault Secrets User' built-in role — read secret VALUES (data-plane).
// https://learn.microsoft.com/azure/role-based-access-control/built-in-roles
var keyVaultSecretsUserRoleId = '4633458b-17de-408a-b874-0445c86b69e6'

// -----------------------------------------------------------------------------
// User-assigned Managed Identity (the identity ESO assumes via Workload Identity)
// -----------------------------------------------------------------------------

resource managedIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: identityName
  location: location
  tags: tags
}

// -----------------------------------------------------------------------------
// AKS cluster — OIDC issuer + Workload Identity + app-routing (managed nginx)
// -----------------------------------------------------------------------------

resource aks 'Microsoft.ContainerService/managedClusters@2024-09-01' = {
  name: aksName
  location: location
  tags: tags
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    dnsPrefix: dnsPrefix
    kubernetesVersion: empty(kubernetesVersion) ? null : kubernetesVersion
    enableRBAC: true
    // OIDC issuer + Workload Identity: required so the federated credential and
    // the chart's azure.workload.identity/client-id annotation work.
    oidcIssuerProfile: {
      enabled: true
    }
    securityProfile: {
      workloadIdentity: {
        enabled: true
      }
    }
    // app-routing add-on == managed ingress-nginx. The overlay's ingress
    // className is "webapprouting.kubernetes.io".
    ingressProfile: {
      webAppRouting: {
        enabled: true
      }
    }
    agentPoolProfiles: [
      {
        name: 'system'
        mode: 'System'
        count: systemNodeCount
        vmSize: systemNodeVmSize
        osDiskSizeGB: systemNodeOsDiskSizeGb
        osType: 'Linux'
        type: 'VirtualMachineScaleSets'
      }
    ]
  }
}

// -----------------------------------------------------------------------------
// Federated identity credential — trusts the AKS OIDC issuer for the chart KSA.
// Subject MUST be system:serviceaccount:<namespace>:<ksa>.
// -----------------------------------------------------------------------------

resource federatedCredential 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2023-01-31' = {
  parent: managedIdentity
  name: 'opensteward-eso'
  properties: {
    issuer: aks.properties.oidcIssuerProfile.issuerURL
    subject: federationSubject
    audiences: [
      'api://AzureADTokenExchange'
    ]
  }
}

// -----------------------------------------------------------------------------
// Key Vault (RBAC authorization) + the app-secrets JSON secret
// -----------------------------------------------------------------------------

resource keyVault 'Microsoft.KeyVault/vaults@2024-11-01' = {
  name: keyVaultName
  location: location
  tags: tags
  properties: {
    tenantId: subscription().tenantId
    sku: {
      family: 'A'
      name: 'standard'
    }
    // Use RBAC (not access policies) so the role assignment below governs access.
    enableRbacAuthorization: true
    enableSoftDelete: true
    enablePurgeProtection: keyVaultPurgeProtection ? true : null
    publicNetworkAccess: 'Enabled'
  }
}

// The JSON app-secrets. Value comes from a @secure() param — never an output.
// NOTE: re-deploying with a different STORE_SECRET inside this JSON rotates it.
resource appSecret 'Microsoft.KeyVault/vaults/secrets@2024-11-01' = {
  parent: keyVault
  name: appSecretName
  properties: {
    value: appSecretsJson
    contentType: 'application/json'
  }
}

// 'Key Vault Secrets User' for the managed identity, scoped to the vault.
// Lets ESO (assuming this identity) read the secret VALUE.
resource kvSecretsUserAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, managedIdentity.id, keyVaultSecretsUserRoleId)
  scope: keyVault
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', keyVaultSecretsUserRoleId)
    principalId: managedIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

// -----------------------------------------------------------------------------
// PostgreSQL Flexible Server (+ database)
// -----------------------------------------------------------------------------

resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: postgresServerName
  location: location
  tags: tags
  sku: {
    name: postgresSkuName
    tier: postgresTier
  }
  properties: {
    version: postgresVersion
    administratorLogin: postgresAdminUser
    administratorLoginPassword: postgresAdminPassword
    storage: {
      storageSizeGB: postgresStorageSizeGb
    }
    network: {
      publicNetworkAccess: postgresAllowPublicAccess ? 'Enabled' : 'Disabled'
    }
    highAvailability: {
      mode: 'Disabled'
    }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
  }
}

resource postgresDb 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  parent: postgres
  name: postgresDatabaseName
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

// Reference convenience: allow other Azure services (incl. the AKS egress) to
// reach the server. 0.0.0.0 is the Azure-internal "allow Azure services" rule.
// REMOVE for production — use private access / a delegated subnet instead.
resource postgresAllowAzure 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2024-08-01' = if (postgresAllowPublicAccess) {
  parent: postgres
  name: 'AllowAllAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

// =============================================================================
// Outputs  (see outputs.md / README for the overlay-placeholder mapping)
// =============================================================================

@description('AKS cluster name.')
output aksClusterName string = aks.name

@description('Resource group of the deployment (use with the AKS name for `az aks get-credentials`).')
output resourceGroupName string = resourceGroup().name

@description('AKS OIDC issuer URL (issuer of the federated credential; informational).')
output aksOidcIssuerUrl string = aks.properties.oidcIssuerProfile.issuerURL

@description('Managed Identity clientId — set serviceAccount.annotations."azure.workload.identity/client-id" to this in the overlay.')
output managedIdentityClientId string = managedIdentity.properties.clientId

@description('AAD tenant id — overlay secrets.externalSecrets.azure.tenantId (<TENANT_ID>).')
output tenantId string = subscription().tenantId

@description('Key Vault URI — overlay secrets.externalSecrets.azure.vaultUrl (https://<KEYVAULT_NAME>.vault.azure.net).')
output keyVaultUri string = keyVault.properties.vaultUri

@description('Key Vault name (the <KEYVAULT_NAME> placeholder, if you prefer building the URL yourself).')
output keyVaultName string = keyVault.name

@description('Remote secret name holding the JSON app secrets — overlay externalSecrets ... remoteSecretName.')
output appSecretName string = appSecret.name

@description('PostgreSQL fully-qualified domain name.')
output postgresFqdn string = postgres.properties.fullyQualifiedDomainName

@description('The Kubernetes ServiceAccount name the chart renders and the federated credential trusts ("<release>-opensteward").')
output chartServiceAccountName string = ksaName

@description('The federated-credential subject (system:serviceaccount:<ns>:<ksa>).')
output federationSubject string = federationSubject

// DATABASE_URL: this is what the operator stores in the K8s secret
// "opensteward-db" (key DATABASE_URL). sslmode=require is mandatory for
// Flexible Server.
//
// We DELIBERATELY do NOT output the password. Bicep refuses to surface a
// @secure() param through an output (and we never want a password in
// deployment history). Instead we output a TEMPLATE with the password elided.
// The deploy.sh script — which already holds the password — substitutes it
// locally and creates the k8s secret. The operator can also have ESO sync the
// DATABASE_URL from a vault secret instead.
@description('DATABASE_URL template for the opensteward-db secret. Replace <POSTGRES_PASSWORD> with the admin password you supplied. (Password intentionally NOT emitted — see README.)')
output databaseUrlTemplate string = 'postgresql://${postgresAdminUser}:<POSTGRES_PASSWORD>@${postgres.properties.fullyQualifiedDomainName}:5432/${postgresDatabaseName}?sslmode=require'

@description('PostgreSQL admin login (for assembling DATABASE_URL).')
output postgresAdminUser string = postgresAdminUser

@description('Application database name (for assembling DATABASE_URL).')
output postgresDatabaseName string = postgresDatabaseName
