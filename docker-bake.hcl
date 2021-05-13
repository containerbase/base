variable "OWNER" {
  default = "containerbase"
}

variable "FILE" {
  default = "buildpack"
}

variable "TAG" {
  default = "latest"
}

group "default" {
  targets = ["build_docker"]
}

group "push" {
  targets = ["push_ghcr", "push_hub", "push_cache"]
}

group "test" {
  targets = ["build_distro"]
}

target "settings" {
  context   = "."
  platforms = ["linux/amd64", "linux/arm64"]

  cache-from = [
    "type=registry,ref=ghcr.io/${OWNER}/cache:${FILE}",
    "type=registry,ref=ghcr.io/${OWNER}/cache:${FILE}-${TAG}",
  ]
}

target "push_cache" {
  inherits  = ["settings"]
  output    = ["type=registry"]
  platforms = ["linux/amd64", "linux/arm64"]

  tags = [
    "ghcr.io/${OWNER}/cache:${FILE}-${TAG}",
    "ghcr.io/${OWNER}/cache:${FILE}",
  ]

  cache-to = ["type=inline,mode=max"]
}

target "build_docker" {
  inherits = ["settings"]

  tags = [
    "ghcr.io/${OWNER}/${FILE}",
    "ghcr.io/${OWNER}/${FILE}:${TAG}",
    "${OWNER}/${FILE}:${TAG}",
    "${OWNER}/${FILE}",
  ]
}

target "build_distro" {
  dockerfile = "Dockerfile.${TAG}"

  tags = [
    "${OWNER}/${FILE}:${TAG}",
  ]
}

target "push_ghcr" {
  inherits  = ["settings"]
  output    = ["type=registry"]
  platforms = ["linux/amd64", "linux/arm64"]

  tags = [
    "ghcr.io/${OWNER}/${FILE}",
    "ghcr.io/${OWNER}/${FILE}:${TAG}",
  ]
}

target "push_hub" {
  inherits = ["settings"]
  output   = ["type=registry"]
  tags     = ["${OWNER}/${FILE}", "${OWNER}/${FILE}:${TAG}"]
}
