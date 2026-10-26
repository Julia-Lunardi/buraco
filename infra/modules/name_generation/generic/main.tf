variable "resource_type" {
  type = string
}
variable "solution_name" {
  type = string
}
variable "environment" {
  type = string
}

output "name" {
  value = "${var.resource_type}-${var.solution_name}-${var.environment}"
}
