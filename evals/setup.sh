#!/bin/bash
set -e

echo "=== Clarity Evals Setup ==="
echo ""

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 not found. Install it from https://python.org"
    exit 1
fi

PYTHON_VERSION=$(python3 --version 2>&1 | awk '{print $2}')
echo "✓ Python $PYTHON_VERSION"

# Check/install Poetry
if ! command -v poetry &> /dev/null; then
    echo "📦 Installing Poetry..."
    curl -sSL https://install.python-poetry.org | python3 -
    echo "✓ Poetry installed"
else
    echo "✓ Poetry $(poetry --version | awk '{print $NF}')"
fi

# Install dependencies
cd "$(dirname "$0")"
echo ""
echo "📦 Installing Python dependencies..."
poetry install
echo "✓ Dependencies installed"

# Check .env
echo ""
if [ -f .env ]; then
    if grep -q "OPENAI_API_KEY=sk-" .env; then
        echo "✓ .env file found with API key"
    else
        echo "⚠️  .env file exists but OPENAI_API_KEY looks empty."
        echo "   Edit evals/.env and add your key: OPENAI_API_KEY=sk-your-key-here"
    fi
else
    echo "OPENAI_API_KEY=" > .env
    echo "⚠️  Created evals/.env — paste your OpenAI API key there:"
    echo "   OPENAI_API_KEY=sk-your-key-here"
fi

echo ""
echo "=== Setup complete! ==="
echo ""
echo "Next steps:"
echo "  1. Make sure evals/.env has your OPENAI_API_KEY"
echo "  2. Run: npm run evals:generate"
echo ""
