# Fix Deploy - SisTesis

## Problema: Login queda en "Ingresando..." / AbortError

### Causa
El build del frontend se hizo sin `VITE_API_BASE`, por lo que las peticiones van a una URL vacía y nunca responden.

### Solución

1. **Rebuild con la variable correcta (SIEMPRE usar este comando, nunca `npm run build` solo):**
```bash
VITE_API_BASE=https://sistesis.site/api npm run build
```

2. **Copiar a ambos contenedores frontend:**
```bash
docker cp /root/SisTesis-GHS/dist/. sistesis_frontend:/usr/share/nginx/html/
docker cp /root/SisTesis-GHS/dist/. sistesis_frontend_container:/usr/share/nginx/html/
```

3. **Verificar que el JS nuevo está siendo servido:**
```bash
curl -s https://sistesis.site/ | grep -o 'assets/index-[^"]*\.js'
```

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

## Notas

- El backend real corre como servicio systemd en el **host** (puerto 3858), no en Docker.
- El nginx que maneja HTTPS está en el contenedor `audiomedia_nginx`.
- Hay **dos** contenedores frontend (`sistesis_frontend` y `sistesis_frontend_container`) — ambos deben actualizarse.
- La BD del servicio systemd está en `/root/SisTesis-GHS/server/data/data.sqlite`.
- La BD del contenedor Docker está en `/app/data/data.sqlite` (volumen `sistesis_data`) — es distinta.
