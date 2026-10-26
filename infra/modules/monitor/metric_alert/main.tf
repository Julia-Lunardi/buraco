variable "resource_group_name" {
  type = string
}
variable "name" {
  type = string
}
variable "action_group_id" {
  type = string
}
variable "scope_id" {
  type = list(string)
}
variable "description" {
  type = string
}
variable "frequency" {
  type    = string
  default = "PT5M"
}
variable "window_size" {
  type    = string
  default = "PT5M"
}
variable "target_resource_type" {
  type    = string
  default = "Microsoft.App/containerApps"
}
variable "alert_criteria" {
  type = object({
    metric_namespace = string
    metric_name      = string
    aggregation      = string
    operator         = string
    threshold        = number
  })
  default = {
    metric_namespace = "Microsoft.App/containerApps"
    metric_name      = "Requests"
    aggregation      = "Total"
    operator         = "GreaterThan"
    threshold        = 500
  }
}

resource "azurerm_monitor_metric_alert" "monitor_metric_alert" {
  name                = var.name
  resource_group_name = var.resource_group_name
  scopes              = var.scope_id
  description         = var.description

  frequency            = var.frequency
  window_size          = var.window_size
  severity             = 2
  auto_mitigate        = true
  target_resource_type = var.target_resource_type

  criteria {
    metric_namespace = var.alert_criteria.metric_namespace
    metric_name      = var.alert_criteria.metric_name
    aggregation      = var.alert_criteria.aggregation
    operator         = var.alert_criteria.operator
    threshold        = var.alert_criteria.threshold
  }

  action {
    action_group_id = var.action_group_id
  }

  lifecycle {
    ignore_changes = [tags]
  }
}
