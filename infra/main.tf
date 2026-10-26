# Buraco on Azure, following Salvie's stack: everything expensive is shared with the
# woddie stack (Postgres server psql-woddie-de, registry acrwoddiede, Container Apps
# environment cae-woddie-de). Buraco adds only a resource group, a Key Vault, its
# database on the shared server, a managed identity and the Container App.

# ---------------------------------------------------------------------------
# @note Naming
# ---------------------------------------------------------------------------

module "globals" {
  source = "./modules/name_generation/globals"
}

module "rg_name" {
  source        = "./modules/name_generation/generic"
  solution_name = var.solution_name
  environment   = var.environment
  resource_type = module.globals.resource_group_resource_abbreviation
}

module "acr_name" {
  source        = "./modules/name_generation/alpha_numeric"
  solution_name = var.solution_name
  environment   = var.environment
  resource_type = module.globals.azure_container_registry_resource_abbreviation
}

module "db_name" {
  source        = "./modules/name_generation/generic"
  solution_name = var.solution_name
  environment   = var.environment
  resource_type = module.globals.postgresql_flexible_server_resource_abbreviation
}

module "kv_name" {
  source        = "./modules/name_generation/generic"
  solution_name = var.solution_name
  environment   = var.environment
  resource_type = module.globals.key_vault_resource_abbreviation
}

module "ca_name" {
  source        = "./modules/name_generation/generic"
  solution_name = var.solution_name
  environment   = var.environment
  resource_type = module.globals.container_app_resource_abbreviation
}

# ---------------------------------------------------------------------------
# @note Resource group
# ---------------------------------------------------------------------------

module "resource_group" {
  source              = "./modules/resource_group"
  resource_group_name = module.rg_name.name
  location            = var.location
}

# ---------------------------------------------------------------------------
# @note Key Vault. Secrets are created by hand BEFORE the first plan (runbook,
# "Add every runtime secret to both vaults"); Terraform only reads them.
# ---------------------------------------------------------------------------

data "azurerm_client_config" "current" {}

module "key_vault" {
  source              = "./modules/key_vault/key_vault"
  key_vault_name      = module.kv_name.name
  resource_group_name = module.resource_group.name
  location            = module.resource_group.location
}

resource "azurerm_role_assignment" "terraform_kv_secrets_officer" {
  count                = var.terraform_operator_object_id != "" ? 1 : 0
  scope                = module.key_vault.id
  role_definition_name = "Key Vault Secrets Officer"
  principal_id         = var.terraform_operator_object_id
}

resource "azurerm_role_assignment" "container_app_kv_secrets_user" {
  scope                = module.key_vault.id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = module.container_app.principal_id
}

resource "azurerm_role_assignment" "github_actions_kv_secrets_user" {
  count                = var.github_actions_sp_object_id != "" ? 1 : 0
  scope                = module.key_vault.id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = var.github_actions_sp_object_id
}

module "kv_secret_secret_key" {
  source       = "./modules/key_vault/key_vault_secret"
  key_vault_id = module.key_vault.id
  name         = "secret-key"
}
# The WEB client id: also the audience of Android tokens (Salvie: putting the Android
# id here makes Android sign-in 401 while iOS works).
module "kv_secret_google_client_id" {
  source       = "./modules/key_vault/key_vault_secret"
  key_vault_id = module.key_vault.id
  name         = "google-client-id"
}
module "kv_secret_google_ios_client_id" {
  source       = "./modules/key_vault/key_vault_secret"
  key_vault_id = module.key_vault.id
  name         = "google-ios-client-id"
}
# Must exist in BOTH vaults (Salvie: missing in de blocked every de apply for weeks).
module "kv_secret_google_android_client_id" {
  source       = "./modules/key_vault/key_vault_secret"
  key_vault_id = module.key_vault.id
  name         = "google-android-client-id"
}
# Only when NOT sharing a server: the admin password of a server this stack creates.
module "kv_secret_db_password" {
  count        = var.shared_db_server_name == "" ? 1 : 0
  source       = "./modules/key_vault/key_vault_secret"
  key_vault_id = module.key_vault.id
  name         = "db-admin-password"
}

# ---------------------------------------------------------------------------
# @note Container Registry (shared acrwoddiede; image repo buraco-backend)
# ---------------------------------------------------------------------------

data "azurerm_container_registry" "shared" {
  count               = var.shared_acr_name != "" ? 1 : 0
  name                = var.shared_acr_name
  resource_group_name = var.shared_acr_resource_group
}

module "container_registry" {
  count               = var.shared_acr_name == "" ? 1 : 0
  source              = "./modules/container_registry"
  name                = module.acr_name.name
  resource_group_name = module.resource_group.name
  location            = module.resource_group.location
  admin_enabled       = false # the app pulls with its managed identity (AcrPull)
}

locals {
  acr_login_server = var.shared_acr_name != "" ? data.azurerm_container_registry.shared[0].login_server : module.container_registry[0].login_server
  acr_id           = var.shared_acr_name != "" ? data.azurerm_container_registry.shared[0].id : module.container_registry[0].id
}

# ---------------------------------------------------------------------------
# @note Database (a database on the shared psql-woddie-de)
# ---------------------------------------------------------------------------

data "azurerm_postgresql_flexible_server" "shared" {
  count               = var.shared_db_server_name != "" ? 1 : 0
  name                = var.shared_db_server_name
  resource_group_name = var.shared_db_resource_group
}

module "database" {
  count                  = var.shared_db_server_name == "" ? 1 : 0
  source                 = "./modules/database"
  server_name            = module.db_name.name
  resource_group_name    = module.resource_group.name
  location               = module.resource_group.location
  administrator_login    = var.db_admin_username
  administrator_password = module.kv_secret_db_password[0].value
  sku_name               = var.db_sku_name
  database_name          = var.db_name
  tenant_id              = data.azurerm_client_config.current.tenant_id
}

# On a shared server only the database is created. The app identity is NOT made a
# server-level Entra admin (effectively superuser over woddie's and salvie's data): it
# is registered as a non-admin principal owning only this database, a one-time SQL
# step (scripts/managed_identity_db_grants.sql, runbook).
resource "azurerm_postgresql_flexible_server_database" "app" {
  count     = var.shared_db_server_name != "" ? 1 : 0
  name      = var.db_name
  server_id = data.azurerm_postgresql_flexible_server.shared[0].id
  collation = "en_US.utf8"
  charset   = "utf8"
}

locals {
  db_server_fqdn    = var.shared_db_server_name != "" ? data.azurerm_postgresql_flexible_server.shared[0].fqdn : module.database[0].fqdn
  app_identity_name = "${module.ca_name.name}-id"
  # No password: the app and Alembic present a fresh Entra token as the identity.
  database_url = "postgresql+asyncpg://${local.app_identity_name}@${local.db_server_fqdn}:5432/${var.db_name}?sslmode=require"
}

# ---------------------------------------------------------------------------
# @note Container App
# ---------------------------------------------------------------------------

module "container_app" {
  source                          = "./modules/container_app"
  resource_group_name             = module.resource_group.name
  location                        = module.resource_group.location
  environment_name                = var.cae_name
  environment_resource_group_name = var.cae_resource_group_name
  app_name                        = module.ca_name.name
  image_tag                       = var.image_tag
  acr_login_server                = local.acr_login_server
  acr_id                          = local.acr_id
  database_url                    = local.database_url
  secret_key                      = module.kv_secret_secret_key.value
  google_client_id                = module.kv_secret_google_client_id.value
  google_ios_client_id            = module.kv_secret_google_ios_client_id.value
  google_android_client_id        = module.kv_secret_google_android_client_id.value
  apple_bundle_id                 = var.apple_bundle_id
  min_replicas                    = var.min_replicas
  max_replicas                    = var.max_replicas
  app_environment                 = var.environment == "de" ? "development" : "production"
}

# ---------------------------------------------------------------------------
# @note Monitoring
# ---------------------------------------------------------------------------

module "action_group" {
  source              = "./modules/monitor/action_group"
  resource_group_name = module.resource_group.name
  name                = "${var.solution_name}-${var.environment}-alerts"
  short_name          = "${var.solution_name}${var.environment}alrt"
  email_receiver      = var.alert_email
}

module "container_app_alert" {
  source              = "./modules/monitor/metric_alert"
  resource_group_name = module.resource_group.name
  name                = "${module.ca_name.name}-high-requests"
  action_group_id     = module.action_group.id
  scope_id            = [module.container_app.app_id]
  description         = "Alert when Container App request volume exceeds threshold"
}
