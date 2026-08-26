# Use an official Node.js Alpine runtime
FROM node:18-alpine AS base

# Add necessary tools for Prisma and OpenSSL
RUN apk add --no-cache openssl bash

# Install pnpm globally
RUN npm install -g pnpm

# Configure pnpm to support Linux architecture for native binaries
RUN pnpm config set supportedArchitectures.os linux

# Set the working directory
WORKDIR /app

# Install dependencies
COPY package.json pnpm-lock.yaml ./

# Remove lock file to regenerate with correct architecture
RUN rm pnpm-lock.yaml || true

RUN pnpm install

# Copy the rest of the app
COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Build app
RUN pnpm run build

# Add entrypoint script
COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

EXPOSE 9000

# Run via entrypoint
CMD ["/app/start.sh"]