#!/usr/bin/env bash
set -euo pipefail
# Run from the CC Switch checkout. BASE_REV is the unmodified upstream revision.
evidence_dir="$(cd "$(dirname "$0")" && pwd)"
cp "$evidence_dir/qa8100.html" src/qa8100.html
cp "$evidence_dir/qa8100.tsx" src/qa8100.tsx
git show "${BASE_REV:-df40d53c}:src/components/providers/ProviderList.tsx" > src/components/providers/ProviderList8100Before.tsx
sed 's@./components/providers/ProviderList"@./components/providers/ProviderList8100Before"@' src/qa8100.tsx > src/qa8100-before.tsx
sed 's@/qa8100.tsx@/qa8100-before.tsx@' src/qa8100.html > src/qa8100-before.html
