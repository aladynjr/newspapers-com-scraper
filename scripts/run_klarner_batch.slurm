#!/bin/bash
#SBATCH --job-name=klarner_news
#SBATCH --cpus-per-task=4
#SBATCH --mem=8G
#SBATCH --time=12:00:00
#SBATCH --output=/n/home09/acamara/newspapers-com-scraper/slurm_logs/%x_%j.out
#SBATCH --error=/n/home09/acamara/newspapers-com-scraper/slurm_logs/%x_%j.err

set -euo pipefail

cd /n/home09/acamara/newspapers-com-scraper

if command -v module >/dev/null 2>&1; then
    module load nodejs >/dev/null 2>&1 || true
fi

srun --ntasks=1 bash scripts/run_klarner_batch.sh "$@"
