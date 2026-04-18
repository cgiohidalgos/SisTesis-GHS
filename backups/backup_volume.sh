#!/bin/bash
# Backup diario del volumen Docker sistesis-ghs_sistesis_data
# Se ejecuta a las 2am via cron

VOLUME_PATH="/var/lib/docker/volumes/sistesis-ghs_sistesis_data/_data"
BACKUP_DIR="/root/SisTesis-GHS/backups"
DATE=$(date '+%Y-%m-%d_%H-%M-%S')
BACKUP_FILE="$BACKUP_DIR/data_backup_$DATE.sqlite"
LOG_FILE="$BACKUP_DIR/backup.log"
MANTENER=2  # Número de backups a conservar

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

mkdir -p "$BACKUP_DIR"

# Hacer checkpoint WAL para asegurar que todos los datos estén en el sqlite principal
if command -v sqlite3 &>/dev/null; then
  sqlite3 "$VOLUME_PATH/data.sqlite" "PRAGMA wal_checkpoint(FULL);" 2>/dev/null
fi

# Copiar la BD principal
if cp "$VOLUME_PATH/data.sqlite" "$BACKUP_FILE"; then
  SIZE=$(du -sh "$BACKUP_FILE" | cut -f1)
  # Contar tesis si Node.js está disponible
  TESIS=$(node -e "
    try {
      const Database = require('/root/SisTesis-GHS/server/node_modules/better-sqlite3');
      const db = new Database('$BACKUP_FILE', { readonly: true });
      const r = db.prepare('SELECT COUNT(*) as c FROM theses').get();
      console.log(r.c);
      db.close();
    } catch(e) { console.log('?'); }
  " 2>/dev/null)
  log "✅ Backup exitoso: $BACKUP_FILE (tamaño: $SIZE, tesis: $TESIS)"
else
  log "❌ ERROR: No se pudo copiar la base de datos desde $VOLUME_PATH"
  exit 1
fi

# También copiar los archivos WAL si existen
if [ -f "$VOLUME_PATH/data.sqlite-wal" ] && [ -s "$VOLUME_PATH/data.sqlite-wal" ]; then
  cp "$VOLUME_PATH/data.sqlite-wal" "$BACKUP_DIR/data_backup_${DATE}.sqlite-wal"
  log "   WAL copiado también"
fi

# Eliminar backups antiguos, conservar solo los últimos $MANTENER
ELIMINADOS=$(ls -t "$BACKUP_DIR"/data_backup_*.sqlite 2>/dev/null | tail -n +$((MANTENER + 1)) | xargs -r rm -f --verbose 2>&1 | wc -l)
# Eliminar también los WAL huérfanos de los backups eliminados
ls -t "$BACKUP_DIR"/data_backup_*.sqlite-wal 2>/dev/null | tail -n +$((MANTENER + 1)) | xargs -r rm -f 2>/dev/null
ls -t "$BACKUP_DIR"/data_backup_*.sqlite-shm 2>/dev/null | tail -n +$((MANTENER + 1)) | xargs -r rm -f 2>/dev/null
if [ "$ELIMINADOS" -gt 0 ]; then
  log "🗑️  $ELIMINADOS backup(s) antiguos eliminados (se conservan los últimos $MANTENER)"
fi

log "--- Fin del backup ---"
