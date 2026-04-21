# GioBot - Diagnóstico de fallos

## Arquitectura real en producción

El tráfico de `https://sistesis.site/api/` va así:

```
Browser → nginx (AudiMedIA) → host:3858 → /root/SisTesis-GHS/server/index.js
```

**NO usa el contenedor Docker** (`thesis_backend` en puerto 4000). Ese contenedor existe pero nginx no lo usa.

El backend real es el servicio systemd: `sistesis-backend.service`

---

## Error: "GioBot no está configurado (falta ANTHROPIC_API_KEY)"

### Causa más común
El proceso en puerto 3858 arrancó sin la variable `ANTHROPIC_API_KEY` (proceso viejo que sobrevivió a un reinicio del servicio).

### Diagnóstico rápido
```bash
# Verificar si el proceso tiene la key
cat /proc/$(ss -tlnp | grep 3858 | grep -o 'pid=[0-9]*' | cut -d= -f2)/environ | tr '\0' '\n' | grep ANTHROPIC
```

Si no imprime nada → el proceso no tiene la key → hay que reiniciarlo.

### Solución
```bash
# 1. Matar el proceso viejo que bloquea el puerto
kill $(ss -tlnp | grep 3858 | grep -o 'pid=[0-9]*' | cut -d= -f2)

# 2. Reiniciar el servicio systemd
sleep 2 && systemctl restart sistesis-backend

# 3. Verificar que arrancó bien
systemctl status sistesis-backend --no-pager
```

### Verificar que el service file tiene la key
```bash
cat /etc/systemd/system/sistesis-backend.service | grep ANTHROPIC
```

Si no está, agregarla:
```bash
# Editar el service file
nano /etc/systemd/system/sistesis-backend.service
# Agregar bajo [Service]:
# Environment=ANTHROPIC_API_KEY=sk-ant-api03-...

systemctl daemon-reload && systemctl restart sistesis-backend
```

---

## Error: POST /api/chat → 503 pero el servicio parece correr

Significa que el proceso en :3858 está vivo pero es una instancia vieja sin la env var.
Aplicar la solución de arriba (kill + restart).

## Error: POST /api/chat → 401 "invalid token"

El token JWT del usuario expiró. Solución: el usuario cierra sesión y vuelve a entrar.

## Error: POST /api/chat → 403 "forbidden"

El usuario tiene rol `student`. GioBot solo está disponible para evaluadores, directores y admins.
