variable "name" {
  type = string
}
variable "resource_group_name" {
  type = string
}
variable "location" {
  type = string
}
variable "sku" {
  type    = string
  default = "Basic"
}
variable "admin_enabled" {
  type    = bool
  default = true
}

resource "azurerm_container_registry" "acr" {
  name                = var.name
  resource_group_name = var.resource_group_name
  location            = var.location
  sku                 = var.sku
  admin_enabled       = var.admin_enabled

  lifecycle {
    ignore_changes = [tags]
  }
}

output "id" {
  value = azurerm_container_registry.acr.id
}
output "login_server" {
  value = azurerm_container_registry.acr.login_server
}
output "admin_username" {
  value = azurerm_container_registry.acr.admin_username
}
output "admin_password" {
  value     = azurerm_container_registry.acr.admin_password
  sensitive = true
}
