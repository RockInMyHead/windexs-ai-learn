#!/bin/bash

# Production startup script for teacher.windexs.ru
echo "🚀 Starting Teacher AI server in production mode..."

# Set production environment
export NODE_ENV=production
export PORT=4000

# Change to server directory
cd "$(dirname "$0")"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install --production
fi

# Check if database exists
if [ ! -f "database.sqlite" ]; then
    echo "🗄️  Initializing database..."
    node create-test-user.js
fi

# Start the server
echo "🌐 Starting server on port $PORT..."
echo "📊 Health check: https://teacher.windexs.ru/health"
echo "🔗 API endpoints: https://teacher.windexs.ru/api/*"

# Use PM2 or direct node
if command -v pm2 &> /dev/null; then
    echo "📦 Using PM2 for process management..."
    pm2 start index.js --name "teacher-ai"
    pm2 save
    pm2 startup
else
    echo "⚠️  PM2 not found, starting with node directly..."
    echo "💡 Consider installing PM2: npm install -g pm2"
    nohup node index.js > server.log 2>&1 &
    echo $! > server.pid
    echo "📝 Logs: server.log"
    echo "🛑 To stop: kill $(cat server.pid)"
fi

echo "✅ Server started successfully!"
