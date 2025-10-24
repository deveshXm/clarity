#!/bin/bash

# Revert landing page changes script
echo "🔄 Reverting landing page to original version..."

# Copy backup over current file
cp src/app/\(public\)/page.backup.tsx src/app/\(public\)/page.tsx

echo "✅ Landing page reverted to original version"
echo "📁 Backup file preserved at: src/app/(public)/page.backup.tsx"
echo ""
echo "To preview original version, restart your dev server:"
echo "npm run dev"
