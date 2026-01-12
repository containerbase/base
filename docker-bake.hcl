variable "OWNER" {
  default = "containerbase"
}
variable "FILE" {
  default = "base"
}
variable "TAG" {
  default = "latest"
}

variable "BASE_IMAGE" {
  default = null
}

variable "CONTAINERBASE_CDN" {
  default = ""
}

variable "CONTAINERBASE_VERSION" {
  default = "unknown"
}

variable "APT_HTTP_PROXY" {
  default = ""
}

variable "CACHE_WEEK" {
  default = ""
}

variable "CONTAINERBASE_DEBUG" {
  default = ""
}

variable "CONTAINERBASE_LOG_LEVEL" {
  default = ""
}

group "default" {
  targets = ["build-docker"]
}

group "test" {
  targets = ["build-test", "build-arm64"]
}

group "test-base" {
  targets = ["build-base"]
}

group "test-distro" {
  targets = ["build-distro"]
}

group "test-x86_64" {
  targets = ["build-test"]
}

group "test-aarch64" {
  targets = ["build-arm64"]
}


target "settings" {
  context = "."
  args = {
    APT_HTTP_PROXY          = "${APT_HTTP_PROXY}"
    CONTAINERBASE_CDN       = "${CONTAINERBASE_CDN}"
    CONTAINERBASE_DEBUG     = "${CONTAINERBASE_DEBUG}"
    CONTAINERBASE_LOG_LEVEL = "${CONTAINERBASE_LOG_LEVEL}"
    CONTAINERBASE_VERSION   = "${CONTAINERBASE_VERSION}"
  }
  cache-from = [
    "type=registry,ref=ghcr.io/${OWNER}/cache:${FILE}",
  ]
}


target "test-settings" {
  inherits = ["settings"]
  args = {
    BASE_IMAGE = "${BASE_IMAGE}"
  }
}

target "build" {
  inherits = ["settings"]
  tags = [
    "ghcr.io/${OWNER}/${FILE}",
    "ghcr.io/${OWNER}/${FILE}:${TAG}",
    "${OWNER}/${FILE}:${TAG}",
    "${OWNER}/${FILE}"
  ]
}

target "build-ttl" {
  inherits = ["settings"]
  output   = ["type=registry"]
  tags = [ ]
}

target "build-docker" {
  inherits = ["settings"]
  output   = ["type=docker"]
  tags = [
    "ghcr.io/${OWNER}/${FILE}",
    "ghcr.io/${OWNER}/${FILE}:${TAG}",
    "${OWNER}/${FILE}:${TAG}",
    "${OWNER}/${FILE}",
    "containerbase/test"
  ]
}

target "build-base" {
  inherits   = ["test-settings"]
  args = {
    BASE_IMAGE = "${TAG}"
  }
  dockerfile = "./test/Dockerfile.base"
}

target "build-distro" {
  inherits   = ["test-settings"]
  args = {
    BASE_IMAGE = "${TAG}"
  }
  dockerfile = "./test/Dockerfile.distro"
}

target "build-test" {
  inherits = ["test-settings"]
  dockerfile = "./test/${TAG}/Dockerfile"
}

target "build-arm64" {
  inherits   = ["test-settings"]
  platforms  = ["linux/arm64"]
  dockerfile = "./test/${TAG}/Dockerfile.arm64"
}

target "push" {
  inherits = ["settings"]
  output   = ["type=registry"]
  cache-to = ["type=registry,ref=ghcr.io/${OWNER}/cache:${FILE},mode=max,image-manifest=true,ignore-error=true"]
  tags     = [
    "ghcr.io/${OWNER}/${FILE}",
    "ghcr.io/${OWNER}/${FILE}:${TAG}",
     "${OWNER}/${FILE}",
     "${OWNER}/${FILE}:${TAG}",
  ]
}
