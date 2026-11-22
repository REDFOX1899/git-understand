#!/usr/bin/env bash
# =============================================================================
# GitUnderstand (git-understand.com) — Cloud Run Production Deploy Script
# Service: git-understand-engine
# Target:  Google Cloud Run (GCP Project: gitunderstand, Region: us-central1)
# =============================================================================

set -euo pipefail

# ANSI color codes (Obsidian Cobalt theme)
COLOR_RESET="\033[0m"
COLOR_COBALT="\033[38;5;39m"
COLOR_CYAN="\033[38;5;51m"
COLOR_EMERALD="\033[38;5;48m"
COLOR_AMBER="\033[38;5;214m"
COLOR_VERMILION="\033[38;5;203m"
COLOR_MUTED="\033[38;5;245m"
COLOR_BOLD="\033[1m"

log_info()    { echo -e "${COLOR_COBALT}[INFO]${COLOR_RESET} $*"; }
log_success() { echo -e "${COLOR_EMERALD}[SUCCESS]${COLOR_RESET} $*"; }
log_warn()    { echo -e "${COLOR_AMBER}[WARN]${COLOR_RESET} $*"; }
log_error()   { echo -e "${COLOR_VERMILION}[ERROR]${COLOR_RESET} $*" >&2; }
log_dryrun()  { echo -e "${COLOR_CYAN}[DRY-RUN]${COLOR_RESET} $*"; }

# -----------------------------------------------------------------------------
# 1. Path Resolution & Flag Parsing
# -----------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

DRY_RUN=false
SHOW_HELP=false

for arg in "$@"; do
  case "${arg}" in
    --dry-run|-n)
      DRY_RUN=true
      shift || true
      ;;
    --help|-h)
      SHOW_HELP=true
      shift || true
      ;;
    *)
      ;;
  esac
done

if [ "${SHOW_HELP}" = true ]; then
  cat <<EOF
Usage: deploy/deploy-cloudrun.sh [OPTIONS]

Deploys the GitUnderstand backend engine to Google Cloud Run.

Options:
  --dry-run, -n    Simulate build and deployment steps without calling GCP
  --help, -h       Show this help message and exit

Environment:
  Loads configuration from: \${WORKSPACE_ROOT}/env/.env
  Default GCP Project:      gitunderstand
  Default GCP Region:       us-central1
  Default Service Name:     git-understand-engine
EOF
  exit 0
fi

echo -e "${COLOR_COBALT}${COLOR_BOLD}"
cat << "BANNER"
   ____ _ _   _   _           _               _                  _ 
  / ___(_) |_| | | |_ __   __| | ___ _ __ ___| |_ __ _ _ __   __| |
 | |  _| | __| | | | '_ \ / _` |/ _ \ '__/ __| __/ _` | '_ \ / _` |
 | |_| | | |_| |_| | | | | (_| |  __/ |  \__ \ || (_| | | | | (_| |
  \____|_|\__|\___/|_| |_|\__,_|\___|_|  |___/\__\__,_|_| |_|\__,_|
BANNER
echo -e "  Cloud Run Deployment Engine  |  https://git-understand.com${COLOR_RESET}\n"

# -----------------------------------------------------------------------------
# 2. Environment Loading (env/.env)
# -----------------------------------------------------------------------------
ENV_FILE="${WORKSPACE_ROOT}/env/.env"
ENV_EXAMPLE="${WORKSPACE_ROOT}/env/.env.example"

if [ -f "${ENV_FILE}" ]; then
  log_info "Loading environment variables from: ${ENV_FILE}"
  # Safely load non-comment, non-empty exportable lines
  while IFS= read -r line || [ -n "$line" ]; do
    # Strip leading/trailing whitespace
    trimmed="$(echo "$line" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
    if [[ -n "$trimmed" && ! "$trimmed" =~ ^# ]]; then
      # Export variable if it matches KEY=VALUE syntax
      if [[ "$trimmed" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]]; then
        export "${trimmed?}"
      fi
    fi
  done < "${ENV_FILE}"
elif [ -f "${ENV_EXAMPLE}" ]; then
  log_warn "Notice: ${ENV_FILE} not found. Falling back to defaults from ${ENV_EXAMPLE}."
else
  log_warn "Notice: Neither ${ENV_FILE} nor ${ENV_EXAMPLE} found. Using built-in defaults."
fi

# -----------------------------------------------------------------------------
# 3. Canonical GCP Configuration
# -----------------------------------------------------------------------------
GCP_PROJECT="${GCP_PROJECT_ID:-gitunderstand}"
GCP_REGION="${GCP_REGION:-us-central1}"
SERVICE_NAME="${CLOUD_RUN_SERVICE:-git-understand-engine}"
IMAGE_TAG="gcr.io/${GCP_PROJECT}/${SERVICE_NAME}:latest"
DOCKERFILE_PATH="${WORKSPACE_ROOT}/deploy/Dockerfile"

# Hardware and Cloud Run Runtime Specifications
MEMORY="4Gi"
CPU="2"
TIMEOUT="900"
PORT="8080"
CORS_ORIGIN_VALUE="https://git-understand.com,https://www.git-understand.com,http://localhost:3000"

log_info "Deployment Target Configuration:"
echo -e "  ${COLOR_MUTED}• Project ID:${COLOR_RESET}        ${GCP_PROJECT}"
echo -e "  ${COLOR_MUTED}• Region:${COLOR_RESET}            ${GCP_REGION}"
echo -e "  ${COLOR_MUTED}• Service Name:${COLOR_RESET}      ${SERVICE_NAME}"
echo -e "  ${COLOR_MUTED}• Container Image:${COLOR_RESET}   ${IMAGE_TAG}"
echo -e "  ${COLOR_MUTED}• Dockerfile:${COLOR_RESET}        ${DOCKERFILE_PATH}"
echo -e "  ${COLOR_MUTED}• Hardware:${COLOR_RESET}          ${CPU} vCPU, ${MEMORY} RAM, CPU Boost enabled"
echo -e "  ${COLOR_MUTED}• Session Affinity:${COLOR_RESET}  Enabled (WebSockets & Live API sessions)"
echo -e "  ${COLOR_MUTED}• Request Timeout:${COLOR_RESET}   ${TIMEOUT}s"
echo -e "  ${COLOR_MUTED}• Ingress:${COLOR_RESET}           Allow Unauthenticated"
echo -e "  ${COLOR_MUTED}• CORS Allowed:${COLOR_RESET}      ${CORS_ORIGIN_VALUE}"

# -----------------------------------------------------------------------------
# 4. Construct Environment Variables for Container Runtime
# -----------------------------------------------------------------------------
ENV_VARS_ARR=(
  "NODE_ENV=production"
  "PORT=${PORT}"
  "CORS_ORIGIN=${CORS_ORIGIN_VALUE}"
)

# Pass optional Gemini model routing variables if present
MODEL_VARS=(
  "GEMINI_MODEL_ARCHITECT"
  "GEMINI_MODEL_VISUAL"
  "GEMINI_MODEL_FAST"
  "GEMINI_MODEL_ORACLE"
  "GEMINI_MODEL_LITE"
  "GEMINI_MODEL_DECISIONS"
  "GEMINI_MODEL_LIVE"
  "GEMINI_MODEL_LIVE_THINKING"
  "GEMINI_MODEL_IMAGE"
  "GEMINI_MODEL_TTS"
  "GEMINI_MODEL_VIDEO"
  "GEMINI_MODEL_EMBEDDING"
  "GEMINI_MODEL_TRANSCRIBE"
  "GEMINI_MANAGED_AGENT"
  "GEMINI_DEEP_RESEARCH"
  "GEMINI_API_KEY"
  "GEMINI_API_KEY_SECONDARY"
  "GITHUB_TOKEN"
)

for var_name in "${MODEL_VARS[@]}"; do
  if [ -n "${!var_name:-}" ]; then
    ENV_VARS_ARR+=("${var_name}=${!var_name}")
  fi
done

# Format comma-separated env string for gcloud run deploy --set-env-vars
JOINED_ENV_VARS=$(IFS=, ; echo "${ENV_VARS_ARR[*]}")

# -----------------------------------------------------------------------------
# 5. Build & Deploy Commands Execution
# -----------------------------------------------------------------------------
BUILD_CMD=(
  gcloud builds submit
  "--project=${GCP_PROJECT}"
  "--tag=${IMAGE_TAG}"
  "--file=${DOCKERFILE_PATH}"
  "${WORKSPACE_ROOT}"
)

DEPLOY_CMD=(
  gcloud run deploy "${SERVICE_NAME}"
  "--image=${IMAGE_TAG}"
  "--project=${GCP_PROJECT}"
  "--region=${GCP_REGION}"
  "--platform=managed"
  "--memory=${MEMORY}"
  "--cpu=${CPU}"
  "--cpu-boost"
  "--session-affinity"
  "--timeout=${TIMEOUT}"
  "--allow-unauthenticated"
  "--port=${PORT}"
  "--set-env-vars=${JOINED_ENV_VARS}"
)

if [ "${DRY_RUN}" = true ]; then
  log_dryrun "Dry-run mode activated. Commands will be printed without execution."
  echo ""
  log_dryrun "Step 1: Container Build Command:"
  echo -e "${COLOR_MUTED}${BUILD_CMD[*]}${COLOR_RESET}"
  echo ""
  log_dryrun "Step 2: Cloud Run Deployment Command:"
  echo -e "${COLOR_MUTED}${DEPLOY_CMD[*]}${COLOR_RESET}"
  echo ""
  log_success "Dry run validation completed successfully."
  exit 0
fi

# Verify gcloud CLI is available
if ! command -v gcloud &> /dev/null; then
  log_error "Google Cloud SDK ('gcloud') CLI is not installed or not in PATH."
  log_error "Please install gcloud or run with --dry-run."
  exit 1
fi

log_info "Step 1/2: Submitting Cloud Build for ${IMAGE_TAG}..."
"${BUILD_CMD[@]}"
log_success "Container image build and push succeeded."

log_info "Step 2/2: Deploying ${SERVICE_NAME} to Cloud Run (${GCP_REGION})..."
"${DEPLOY_CMD[@]}"
log_success "Cloud Run deployment complete!"

# Retrieve and print service URL
SERVICE_URL=$(gcloud run services describe "${SERVICE_NAME}" \
  --project="${GCP_PROJECT}" \
  --region="${GCP_REGION}" \
  --format='value(status.url)' 2>/dev/null || true)

if [ -n "${SERVICE_URL}" ]; then
  echo ""
  log_success "Service is LIVE at: ${COLOR_CYAN}${SERVICE_URL}${COLOR_RESET}"
  log_info "Public API endpoint: https://api.git-understand.com"
fi
