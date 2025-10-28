#!/bin/bash

# CF-Analyst Setup Script
# This script helps set up the project for development

echo "🚀 Setting up CF-Analyst project..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version 18+ is required. Current version: $(node -v)"
    exit 1
fi

echo "✅ Node.js $(node -v) detected"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Create .dev.vars file if it doesn't exist
if [ ! -f ".dev.vars" ]; then
    echo "📝 Creating .dev.vars file..."
    cp .dev.vars.example .dev.vars
    echo "✅ Created .dev.vars file. Please edit it with your environment variables."
else
    echo "✅ .dev.vars file already exists"
fi

# Run initial tests
echo "🧪 Running tests..."
npm test

# Run linting
echo "🔍 Running linter..."
npm run lint

echo ""
echo "🎉 Setup complete!"
echo ""
echo "Next steps:"
echo "1. Edit .dev.vars with your environment variables"
echo "2. Run 'npm run dev' to start the development server"
echo "3. Create your GitHub repository at: https://github.com/robdanz/cf-analyst"
echo "4. Set up GitHub Actions secrets for deployment:"
echo "   - CLOUDFLARE_API_TOKEN"
echo "   - CLOUDFLARE_ACCOUNT_ID"
echo ""
echo "Happy coding! 🚀"
