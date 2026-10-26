variable "resource_group_name" {
  type = string
}
variable "name" {
  type = string
}
variable "short_name" {
  type        = string
  description = "Display name — max 12 characters"
}
variable "email_receiver" {
  type    = list(string)
  default = []
}

resource "azurerm_monitor_action_group" "monitor_action_group" {
  resource_group_name = var.resource_group_name
  name                = var.name
  short_name          = var.short_name

  dynamic "email_receiver" {
    for_each = var.email_receiver
    content {
      name                    = email_receiver.value
      email_address           = email_receiver.value
      use_common_alert_schema = true
    }
  }

  lifecycle {
    ignore_changes = [tags]
  }
}

output "id" {
  value = azurerm_monitor_action_group.monitor_action_group.id
}
