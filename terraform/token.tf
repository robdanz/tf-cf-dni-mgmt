resource "cloudflare_api_token" "worker" {
  name = "${var.worker_name}-runtime"

  policy {
    permission_groups = [
      local.account_permissions["Teams Write"],
      local.account_permissions["Intel Read"],
    ]
    resources = {
      "com.cloudflare.api.account.${var.cloudflare_account_id}" = "*"
    }
  }
}
