#!/bin/bash
# Standard entry point; the real server lives in run_unstuck.sh.
set -euo pipefail
cd "$(dirname "$0")"
exec ./run_unstuck.sh "$@"
