# Match package.json engines (node >= 20.19) and packageManager (pnpm@8.15.4)
FROM node:20-alpine AS base

# Add necessary tools for Prisma and OpenSSL
RUN apk add --no-cache openssl bash

# Pin pnpm to the lockfile era — latest pnpm 10+ fails with
# ERR_PNPM_PNPM_ENGINE_IDENTITY_UNVERIFIABLE on pnpm 8 lockfiles
RUN corepack enable && corepack prepare pnpm@8.15.4 --activate

# Ensure pnpm can verify and install Linux native binaries
RUN pnpm config set supportedArchitectures.os linux

# Set the working directory
WORKDIR /app

# Install dependencies
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

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