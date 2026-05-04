# Fix Deploy - SisTesis

---

## ✅ DEPLOY CORRECTO — Usar siempre este flujo

Cuando hay cambios en el código fuente (frontend o backend), el deploy correcto es:

### 1. Frontend — rebuild y redeploy en Docker

```bash
cd /root/SisTesis-GHS

# Reconstruir imagen (compila Vite con VITE_API_BASE ya configurado en docker-compose.sistesis.yml)
docker compose -f docker-compose.sistesis.yml build --no-cache frontend

# Reemplazar el contenedor en vivo
docker compose -f docker-compose.sistesis.yml up -d frontend

# Verificar que el nuevo JS está siendo servido
curl -s https://sistesis.site/ | grep -o 'assets/index-[^"]*\.js'
```

> **Nunca usar `docker cp` ni `npm run build` manual** para actualizar el frontend en producción.
> El `VITE_API_BASE=https://sistesis.site/api` ya está declarado como `args` en el compose y se inyecta automáticamente.

### 2. Backend — reiniciar servicio systemd

```bash
# El backend corre como servicio en el host (NO en Docker)
cd /root/SisTesis-GHS/server
# Si hubo cambios en server/index.js u otros archivos del servidor:
systemctl restart sistesis-backend.service
systemctl is-active sistesis-backend.service
```

### 3. Verificación post-deploy

```bash
# JS nuevo en frontend
curl -s https://sistesis.site/ | grep -o 'assets/index-[^"]*\.js'

# Backend responde
curl -s -m 5 https://sistesis.site/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"admin@admin.com","password":"admin"}' | head -c 100
```

---

## Problema: Login queda en "Ingresando..." / AbortError

### Causa
El build del frontend se hizo sin `VITE_API_BASE`, o se usó `docker cp` con un build local incorrecto, por lo que las peticiones van a una URL vacía.

### Solución
Seguir el flujo de deploy correcto de arriba (`build --no-cache` + `up -d frontend`).

---

## Problema: Backend no arranca (EADDRINUSE puerto 3858)

### Causa
Quedó un proceso Node huérfano ocupando el puerto 3858 después de un reinicio manual.

### Solución

1. **Matar el proceso que ocupa el puerto:**
```bash
kill -9 $(ss -tlnp | grep 3858 | grep -oP 'pid=\K[0-9]+')
```

2. **Reiniciar el servicio:**
```bash
systemctl restart sistesis-backend.service
systemctl is-active sistesis-backend.service
```

3. **Verificar que responde:**
```bash
curl -s -m 5 https://sistesis.site/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"admin@admin.com","password":"admin"}'
```

---

## Problema: Nadie puede iniciar sesión — "Correo o contraseña incorrectos"

### Causa
El `authLimiter` bloquea una IP después de **20 intentos fallidos de login en 15 minutos**. Cuando alguien prueba credenciales incorrectas repetidamente (o se hicieron varios deploys con URL rota), la IP queda bloqueada y rechaza hasta credenciales correctas.

### Diagnóstico rápido
```bash
# ¿El backend responde bien directamente?
curl -s -m 5 https://sistesis.site/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"cghidalgos@usbcali.edu.co","password":"carlos1085281803"}'
# Si devuelve token → el backend está bien, es el rate limit desde el browser
# Si devuelve error 401 → credenciales incorrectas en la BD (ver abajo)
# Si devuelve error 429 → rate limit activo desde este servidor también
```

### Solución: limpiar rate limit
```bash
systemctl restart sistesis-backend.service
systemctl is-active sistesis-backend.service
```

### Si además la contraseña está mal en la BD
```bash
# Generar nuevo hash
HASH=$(node -e "const b=require('/root/SisTesis-GHS/server/node_modules/bcrypt'); b.hash('NUEVA_PASS',10).then(h=>console.log(h))")

# Actualizar en la BD
sqlite3 /root/SisTesis-GHS/server/data/data.sqlite \
  "UPDATE users SET password_hash='$HASH' WHERE UPPER(institutional_email)='CORREO@USBCALI.EDU.CO';"
```

---

## Notas

- El backend real corre como servicio systemd en el **host** (puerto 3858), no en Docker.
- El nginx que maneja HTTPS está en el contenedor `audiomedia_nginx`.
- Hay **dos** contenedores frontend (`sistesis_frontend` y `sistesis_frontend_container`) — ambos deben actualizarse.
- La BD del servicio systemd está en `/root/SisTesis-GHS/server/data/data.sqlite`.
- La BD del contenedor Docker está en `/app/data/data.sqlite` (volumen `sistesis_data`) — es distinta.
