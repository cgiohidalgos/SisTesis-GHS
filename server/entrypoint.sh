#!/bin/sh
set -e


# Crea la carpeta de datos si no existe
if [ ! -d /app/data ]; then
  mkdir -p /app/data
  chmod 777 /app/data
fi

# Crea el archivo de base de datos si no existe
if [ ! -f /app/data/data.sqlite ]; then
  touch /app/data/data.sqlite
  chmod 666 /app/data/data.sqlite
fi

# Crea la carpeta de uploads si no existe
if [ ! -d /app/uploads ]; then
  mkdir -p /app/uploads
  chmod 777 /app/uploads
fi


# Inicializa el esquema de la base de datos antes del seed
echo "Inicializando esquema de la base de datos..."
node db-init.js

# Ejecuta el seed para crear el usuario admin si no existe
echo "Ejecutando seed para crear usuario admin si no existe..."
npm run seed || true

exec "$@"