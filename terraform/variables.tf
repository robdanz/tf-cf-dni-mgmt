variable "cloudflare_api_token" {
  description = "API token (Workers Scripts Edit, Access: Apps Edit, Zero Trust Edit, Intel Read)"
  type        = string
  sensitive   = true
}

variable "cloudflare_account_id" {
  description = "Cloudflare account ID"
  type        = string
}

variable "cloudflare_workers_subdomain" {
  description = "Workers subdomain (e.g. 'rob-danz' from rob-danz.workers.dev)"
  type        = string
}

variable "cloudflare_access_team" {
  description = "Cloudflare Access team name (e.g. 'tancow' from tancow.cloudflareaccess.com)"
  type        = string
}

variable "worker_name" {
  description = "Name of the Worker"
  type        = string
  default     = "tf-cf-dni-mgmt"
}
