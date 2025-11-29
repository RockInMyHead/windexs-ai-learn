FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY server/package*.json ./server/
COPY package*.json ./

# Install dependencies
RUN cd server && npm ci --only=production && cd .. && npm ci --only=production

# Copy application code
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S teacher -u 1001

# Create data directory and set permissions
RUN mkdir -p /app/server && \
    chown -R teacher:nodejs /app

# Switch to non-root user
USER teacher

# Expose port
EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:4000/health || exit 1

# Start the application
CMD ["node", "server/index.js"]
