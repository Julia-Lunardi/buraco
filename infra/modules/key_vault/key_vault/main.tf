variable "key_vault_name" {
  type = string
}
variable "resource_group_name" {
  type = string
}
variable "location" {
  type = string
}
variable "purge_protection_enabled" {
  type    = bool
  default = false
}

data "azurerm_client_config" "current" {}

resource "azurerm_key_vault" "key_vault" {
  name                            = var.key_vault_name
  location                        = var.location
  resource_group_name             = var.resource_group_name
  tenant_id                       = data.azurerm_client_config.current.tenant_id
  sku_name                        = "standard"
  purge_protection_enabled        = var.purge_protection_enabled
  enabled_for_template_deployment = true
  rbac_authorization_enabled      = true

  lifecycle {
    ignore_changes = [tags]
  }
}

output "id" {
  value = azurerm_key_vault.key_vault.id
}
output "uri" {
  value = azurerm_key_vault.key_vault.vault_uri
}
