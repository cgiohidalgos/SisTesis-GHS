FROM node:18-bullseye-slim

# Install LibreOffice + build tools for native modules
RUN apt-get update && apt-get install -y \
    libreoffice \
    libreoffice-writer \
    fonts-liberation \
    python3 \
    make \
    g++ \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy source files explicitly (avoids overwriting node_modules with host-compiled binaries)
COPY server/package.json server/package-lock.json* ./
COPY server/*.js ./
COPY server/*.sh ./
COPY server/nodemon.json ./
COPY server/Formatos/ ./Formatos/

# Install dependencies and rebuild native modules compiled for this Node.js version
RUN npm install && npm rebuild better-sqlite3 --build-from-source

RUN chmod +x /app/entrypoint.sh

EXPOSE 4000

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["node", "index.js"]
