variable "server_name" {
  type = string
}
variable "resource_group_name" {
  type = string
}
variable "location" {
  type = string
}
variable "administrator_login" {
  type = string
}
variable "administrator_password" {
  type      = string
  sensitive = true
}
variable "sku_name" {
  type    = string
  default = "B_Standard_B1ms"
}
variable "storage_mb" {
  type    = number
  default = 32768
}
variable "pg_version" {
  type    = string
  default = "16"
}
variable "backup_retention_days" {
  type    = number
  default = 7
}
variable "tenant_id" {
  type        = string
  description = "Entra ID tenant used for Microsoft Entra authentication."
}

resource "azurerm_postgresql_flexible_server" "server" {
  name                   = var.server_name
  resource_group_name    = var.resource_group_name
  location               = var.location
  version                = var.pg_version
  administrator_login    = var.administrator_login
  administrator_password = var.administrator_password
  storage_mb             = var.storage_mb
  sku_name               = var.sku_name

  # Entra (managed identity) auth for the Container App; password auth kept
  # enabled as a break-glass fallback (pgadmin still works for manual ops).
  authentication {
    active_directory_auth_enabled = true
    password_auth_enabled         = true
    tenant_id                     = var.tenant_id
  }

  backup_retention_days        = var.backup_retention_days
  geo_redundant_backup_enabled = false

  lifecycle {
    ignore_changes = [tags, zone]
  }
}

variable "database_name" {
  type    = string
  default = "buraco"
}

resource "azurerm_postgresql_flexible_server_database" "app" {
  name      = var.database_name
  server_id = azurerm_postgresql_flexible_server.server.id
  collation = "en_US.utf8"
  charset   = "utf8"
}

# Special Azure range that allows all Azure-hosted services to connect
resource "azurerm_postgresql_flexible_server_firewall_rule" "azure_services" {
  name             = "AllowAzureServices"
  server_id        = azurerm_postgresql_flexible_server.server.id
  start_ip_address = "0.0.0.0"
  end_ip_address   = "0.0.0.0"
}

output "server_id" {
  value = azurerm_postgresql_flexible_server.server.id
}
output "server_name" {
  value = azurerm_postgresql_flexible_server.server.name
}
output "fqdn" {
  value = azurerm_postgresql_flexible_server.server.fqdn
}
