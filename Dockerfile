# Debian/Ubuntu-based Node image with OpenSSL installed so Prisma can detect libssl
# Installs runtime OpenSSL libraries and generates Prisma client at build time.

FROM node:18-bullseye

# Install OpenSSL runtime libraries and certs
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates libssl-dev \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies (use package-lock if present)
COPY package*.json ./
RUN npm ci

# Copy app source
COPY . .

# Generate Prisma client during build so startup won't show the libssl detection warning
RUN npx prisma generate

EXPOSE 3000

# Use the project's start script (e.g., "prisma generate && tsx src/index.ts")
CMD ["npm", "start"]
