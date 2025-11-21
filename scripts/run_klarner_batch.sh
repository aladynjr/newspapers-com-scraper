#!/usr/bin/env bash

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEFAULT_CSV="/n/holylabs/LABS/snyder_lab/Lab/replication/unique_names_klarner.csv"
DEFAULT_OUTPUT_DIR="/n/holylabs/LABS/snyder_lab/Lab/replication/data"
NODE_SCRIPT="${NODE_SCRIPT:-$REPO_ROOT/examples/main.js}"
LOG_DIR="${LOG_DIR:-$REPO_ROOT/batch_logs}"
PYTHON_BIN="${PYTHON_BIN:-python3}"
ENV_BIN="${ENV_BIN:-}"

CSV_PATH="$DEFAULT_CSV"
OUTPUT_DIR="$DEFAULT_OUTPUT_DIR"
MAX_NAMES=0
SEARCH_LIMIT_OVERRIDE=""
START_YEAR=""
END_YEAR=""

usage() {
    cat <<'EOF'
Usage: run_klarner_batch.sh [options]

Options:
  -c, --csv PATH         Path to the Klarner CSV file (default: repository setting)
  -o, --output DIR       Target directory for CSV output (default: replication/data)
  -n, --names COUNT      Process only the first COUNT names (for testing)
  -l, --limit LIMIT      Override SEARCH_LIMIT for each run
  -s, --start YEAR       Override SEARCH_DATE_START (inclusive)
  -e, --end YEAR         Override SEARCH_DATE_END (inclusive)
  -h, --help             Show this help message
EOF
}

require_int() {
    local value="$1"
    local label="$2"
    if [[ -n "$value" && ! "$value" =~ ^[0-9]+$ ]]; then
        echo "Expected integer for $label, received '$value'" >&2
        exit 1
    fi
}

resolve_chrome_path() {
    local cmd found
    for cmd in google-chrome-stable google-chrome chromium-browser chromium; do
        if found="$(command -v "$cmd" 2>/dev/null)"; then
            echo "$found"
            return 0
        fi
    done

    if command -v node >/dev/null 2>&1; then
        local puppeteer_path=""
        puppeteer_path="$(node -e "try { const puppeteer = require('puppeteer'); const execPath = typeof puppeteer.executablePath === 'function' ? puppeteer.executablePath() : ''; if (execPath) { console.log(execPath); } } catch (error) { process.exit(0); }" 2>/dev/null || true)"
        if [[ -n "$puppeteer_path" ]]; then
            echo "$puppeteer_path"
            return 0
        fi
    fi

    return 1
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        -c|--csv)
            CSV_PATH="$2"
            shift 2
            ;;
        -o|--output)
            OUTPUT_DIR="$2"
            shift 2
            ;;
        -n|--names)
            MAX_NAMES="$2"
            require_int "$MAX_NAMES" "--names"
            shift 2
            ;;
        -l|--limit)
            SEARCH_LIMIT_OVERRIDE="$2"
            require_int "$SEARCH_LIMIT_OVERRIDE" "--limit"
            shift 2
            ;;
        -s|--start)
            START_YEAR="$2"
            require_int "$START_YEAR" "--start"
            shift 2
            ;;
        -e|--end)
            END_YEAR="$2"
            require_int "$END_YEAR" "--end"
            shift 2
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "Unknown option: $1" >&2
            usage >&2
            exit 1
            ;;
    esac
done

if [[ ! -f "$CSV_PATH" ]]; then
    echo "CSV file not found: $CSV_PATH" >&2
    exit 1
fi

if [[ -z "$ENV_BIN" ]]; then
    if [[ -x /usr/bin/env ]]; then
        ENV_BIN="/usr/bin/env"
    elif [[ -x /bin/env ]]; then
        ENV_BIN="/bin/env"
    else
        ENV_BIN="env"
    fi
fi

if [[ "$ENV_BIN" != "env" && ! -x "$ENV_BIN" ]]; then
    echo "env binary '$ENV_BIN' is not executable" >&2
    exit 1
fi

if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
    if command -v python >/dev/null 2>&1; then
        PYTHON_BIN="python"
    else
        echo "Python interpreter not found (looked for $PYTHON_BIN or python)" >&2
        exit 1
    fi
fi

# Respect explicit env override; default to false so we can help with logins locally.
USER_SPECIFIED_HEADLESS="${SCRAPER_HEADLESS+x}"
SCRAPER_HEADLESS="${SCRAPER_HEADLESS:-false}"

if [[ "$SCRAPER_HEADLESS" != "true" && -z "${DISPLAY:-}" && -z "${WAYLAND_DISPLAY:-}" ]]; then
    echo "No graphical display detected; forcing SCRAPER_HEADLESS=true" >&2
    SCRAPER_HEADLESS="true"
fi

if [[ -z "${SCRAPER_CHROME_PATH:-}" ]]; then
    if chrome_candidate="$(resolve_chrome_path)"; then
        SCRAPER_CHROME_PATH="$chrome_candidate"
    fi
fi

if [[ -n "$SCRAPER_CHROME_PATH" && ! -x "$SCRAPER_CHROME_PATH" ]]; then
    echo "Warning: Chrome binary '$SCRAPER_CHROME_PATH' is not executable" >&2
fi

mkdir -p "$OUTPUT_DIR" "$LOG_DIR"

mapfile -t ALL_NAMES < <("$PYTHON_BIN" - "$CSV_PATH" <<'PY'
import csv
import string
import sys

csv_path = sys.argv[1]
special = {"II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "JR", "SR"}
names = []
seen = set()

with open(csv_path, newline='', encoding='utf-8') as fh:
    reader = csv.DictReader(fh)
    for row in reader:
        raw = (row.get('name') or '').strip()
        if not raw:
            continue
        normalized = string.capwords(raw.lower())
        tokens = []
        for token in normalized.split():
            upper = token.upper()
            tokens.append(upper if upper in special else token)
        cleaned = ' '.join(tokens)
        if cleaned and cleaned not in seen:
            seen.add(cleaned)
            names.append(cleaned)

for name in names:
    print(name)
PY
)

if [[ ${#ALL_NAMES[@]} -eq 0 ]]; then
    echo "No names found in $CSV_PATH" >&2
    exit 1
fi

if [[ "$MAX_NAMES" -gt 0 && "$MAX_NAMES" -lt ${#ALL_NAMES[@]} ]]; then
    mapfile -t NAMES < <(printf '%s\n' "${ALL_NAMES[@]:0:MAX_NAMES}")
else
    NAMES=("${ALL_NAMES[@]}")
fi

TOTAL=${#NAMES[@]}

progress_bar() {
    local current=$1
    local total=$2
    local width=40

    if (( total == 0 )); then
        printf "\r[%-*s] %3d%% (%d/%d)" "$width" "" 0 0 0
        return
    fi

    local percent=$(( current * 100 / total ))
    local filled=$(( width * current / total ))
    local empty=$(( width - filled ))
    local bar=""
    if (( filled > 0 )); then
        bar="$(printf '%0.s#' $(seq 1 $filled))"
    fi
    if (( empty > 0 )); then
        bar="$bar$(printf '%0.s-' $(seq 1 $empty))"
    fi
    printf "\r[%s] %3d%% (%d/%d)" "$bar" "$percent" "$current" "$total"
}

safe_fragment() {
    local input="$1"
    local lowered
    lowered="$(echo "$input" | tr '[:upper:]' '[:lower:]')"
    echo "$lowered" | tr -cs 'a-z0-9' '-' | sed 's/^-*//; s/-*$//'
}

declare -a FAILURES=()
SUCCESS_COUNT=0

echo "Processing $TOTAL unique names from $(basename "$CSV_PATH")"
printf '%s\n' "Logs: $LOG_DIR"
printf '%s\n' "Output: $OUTPUT_DIR"
if [[ -n "$SCRAPER_CHROME_PATH" ]]; then
    printf '%s\n' "Chrome: $SCRAPER_CHROME_PATH"
else
    printf '%s\n' "Chrome: auto (puppeteer lookup)"
fi
printf '%s\n' "Headless: $SCRAPER_HEADLESS"

for idx in "${!NAMES[@]}"; do
    name="${NAMES[$idx]}"
    current=$((idx + 1))
    progress_bar "$current" "$TOTAL"

    safe_name=$(safe_fragment "$name")
    log_path="$LOG_DIR/${current}_$safe_name.log"

    "$ENV_BIN" NEWSPAPER_OUTPUT_DIR="$OUTPUT_DIR" \
        SEARCH_KEYWORD="$name" \
        SEARCH_LIMIT="${SEARCH_LIMIT_OVERRIDE:-}" \
        SEARCH_DATE_START="${START_YEAR:-}" \
        SEARCH_DATE_END="${END_YEAR:-}" \
        SCRAPER_HEADLESS="$SCRAPER_HEADLESS" \
        SCRAPER_CHROME_PATH="${SCRAPER_CHROME_PATH:-}" \
        node "$NODE_SCRIPT" >"$log_path" 2>&1 || {
            FAILURES+=("$name (log: $log_path)")
            continue
        }

    ((SUCCESS_COUNT++))
done

printf '\n'

if (( ${#FAILURES[@]} > 0 )); then
    echo "Completed with ${#FAILURES[@]} failures:"
    printf '  - %s\n' "${FAILURES[@]}"
    exit 1
fi

echo "Successfully processed $SUCCESS_COUNT names."
