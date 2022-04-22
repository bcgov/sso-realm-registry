terraform {
  required_version = ">= 0.15.3"
}

module "deployer" {
  source  = "bcgov/openshift/deployer"
  version = "0.5.0"

  name      = "oc-deployer"
  namespace = "b861c7-prod"
}

output "sc_secret" {
  value = module.deployer.default_secret_name
}
