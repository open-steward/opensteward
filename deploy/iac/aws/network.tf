# VPC with public + private (workload) + intra (database) subnets.
#
# - Public subnets host the internet-facing ALBs the AWS Load Balancer
#   Controller provisions for the chart Ingress (tagged kubernetes.io/role/elb).
# - Private subnets run the EKS nodes (tagged .../internal-elb) and reach the
#   internet via a single NAT gateway (lean default — set one_nat_gateway_per_az
#   for HA egress).
# - Database subnets are isolated for the RDS subnet group.

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.13"

  name = "${var.name_prefix}-vpc"
  cidr = var.vpc_cidr
  azs  = local.azs

  # /16 carved into /20 private (workloads), /24 public (ALBs), /24 database.
  private_subnets  = [for i in range(var.az_count) : cidrsubnet(var.vpc_cidr, 4, i)]
  public_subnets   = [for i in range(var.az_count) : cidrsubnet(var.vpc_cidr, 8, i + 48)]
  database_subnets = [for i in range(var.az_count) : cidrsubnet(var.vpc_cidr, 8, i + 64)]

  create_database_subnet_group = true

  enable_nat_gateway   = true
  single_nat_gateway   = true # lean default; flip for per-AZ egress HA
  enable_dns_hostnames = true
  enable_dns_support   = true

  # Subnet discovery tags the AWS Load Balancer Controller relies on.
  public_subnet_tags = {
    "kubernetes.io/role/elb"                      = "1"
    "kubernetes.io/cluster/${local.cluster_name}" = "shared"
  }
  private_subnet_tags = {
    "kubernetes.io/role/internal-elb"             = "1"
    "kubernetes.io/cluster/${local.cluster_name}" = "shared"
  }

  tags = local.tags
}
