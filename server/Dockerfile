FROM node:18-bullseye-slim

WORKDIR /app

# Install build deps required by native modules
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && \
		apt-get install -y --no-install-recommends ca-certificates apt-transport-https gnupg dirmngr || true && \
		apt-get update || true && \
		apt-get install -y --no-install-recommends \
			build-essential python3 python3-dev pkg-config libsqlite3-dev \
			-o Acquire::Retries=3 --fix-missing && \
		rm -rf /var/lib/apt/lists/*


# install server deps
COPY server/package.json server/package-lock.json* ./
RUN npm install

# Instalar sqlite3 CLI para depuración y LibreOffice Writer para conversión DOCX→PDF
RUN apt-get update && apt-get install -y --no-install-recommends sqlite3 libreoffice-writer && rm -rf /var/lib/apt/lists/*

# copy server code
COPY server/ ./


# Crear carpeta de datos y dar permisos antes de copiar el código
RUN mkdir -p /app/data && chmod 777 /app/data

# Copiar y dar permisos al entrypoint
COPY server/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

EXPOSE 4000


# Ejecutar como root para evitar problemas de permisos con volúmenes
USER root
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["npm", "run", "dev"]
