variable "resource_group_name" {
  type = string
}
variable "location" {
  type = string
}

resource "azurerm_resource_group" "resource_group" {
  name     = var.resource_group_name
  location = var.location

  lifecycle {
    ignore_changes = [tags]
  }
}

output "name" {
  value = azurerm_resource_group.resource_group.name
}
output "location" {
  value = azurerm_resource_group.resource_group.location
}
