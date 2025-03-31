#!/usr/bin/env bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"

if [ ! -x "$(command -v envsubst)" ]; then
  echo >&2 "error: envsubst not installed"
  exit 1
fi

# Function to generate table of contents from markdown headings
generate_toc() {
  local file="$1"
  local max_depth="${2:-6}"  # Default to 6 if not provided (h1-h6)
  
  # Extract headings, ignore the first title, and generate TOC entries
  awk -v max_depth="$max_depth" '
        BEGIN { 
          first_heading = 1 
          in_code_block = 0  # Track if we are inside a code block
        }
        # Toggle code block state when we encounter triple backticks
        /^```/ {
          in_code_block = !in_code_block
          next
        }
        # Only process headings when not in a code block
        /^#/ && !in_code_block {
            if (first_heading) {
                first_heading = 0
                next
            }
            level = length($1)  # Count number of #
            
            # Skip if heading level is greater than max_depth
            if (level > max_depth) next
            
            title = substr($0, level + 2)  # Remove #s and space
            link = tolower(title)
            gsub(/[[:space:]]/, "-", link)  # Replace spaces with hyphens
            gsub(/[^a-z0-9-]/, "", link)  # Remove other special characters
            printf "%*s- **[%s](#%s)**\n", (level - 2) * 2, "", title, link
        }
    ' "$file"
}

deployments="$($SCRIPT_DIR/generateDeploymentsMarkdown.sh)" \
  envsubst '$deployments' \
  <README.md.template \
  >README.md.tmp

toc=$(generate_toc README.md.tmp 3) \
  envsubst '$toc' \
  <README.md.tmp \
  >README.md

rm README.md.tmp
