# Use an official Node.js Alpine runtime
FROM node:18-alpine AS base

# Add necessary tools for Prisma and OpenSSL
RUN apk add --no-cache openssl bash

# Set the working directory
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm install

# Copy the rest of the app
COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Build app
RUN npm run build

# Add entrypoint script
COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

EXPOSE 9000

# Run via entrypoint
CMD ["/app/start.sh"]
