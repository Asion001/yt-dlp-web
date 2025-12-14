#!/bin/bash
set -e

echo "🐳 Building Docker image..."
docker build -t yt-dlp-web .

echo ""
echo "✅ Build complete!"
echo ""
echo "To run the container:"
echo "  docker-compose up -d"
echo ""
echo "Or manually:"
echo "  docker run -d -p 3000:3000 -v \$(pwd)/downloads:/downloads -v \$(pwd)/data:/app/data yt-dlp-web"
