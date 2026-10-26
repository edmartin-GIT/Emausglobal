# Emaús Global

Calendario mundial de retiros de Emaús (hombres y mujeres, en español e inglés). Busca por **país, ciudad, mes, tipo de retiro e idioma**, con vista en tarjetas o tabla, gráfico de los próximos 12 meses y botón **ES | EN**. Incluye un panel de administrador (usuario y contraseña) para agregar, editar y borrar retiros.

Node.js + Express + SQLite (`better-sqlite3`), igual que `registro-guadalupe` y `OLG-wedding-form`. La primera vez que arranca con la base vacía carga los 120 retiros de `seed/retiros.json` (Colombia, España, EE.UU., Panamá, Italia, Perú y otros). Después los datos viven en `/data/emaus.db` dentro del contenedor.

## Variables de entorno

| Variable         | Requerida | Descripción |
|------------------|-----------|-------------|
| `ADMIN_PASS`     | Sí        | Contraseña del administrador. Sin ella el panel queda deshabilitado. |
| `ADMIN_USER`     | No        | Usuario del administrador (por defecto `admin`). |
| `SESSION_SECRET` | No        | Clave para firmar las sesiones (por defecto se deriva de `ADMIN_PASS`). |
| `DB_PATH`        | No        | Ruta de la base de datos (por defecto `/data/emaus.db`). |
| `PORT`           | No        | Puerto (por defecto `3000`). |

La sesión del administrador dura 12 horas. Para cambiar el usuario o la contraseña, cambia las variables y reconstruye el contenedor.

## Probar en la PC

```bash
npm install
ADMIN_PASS=prueba DB_PATH=./data/emaus.db node server.js
```

Abrir http://localhost:3000. Para entrar como administrador: botón **Administrador** (usuario `admin`, contraseña `prueba`).

## Publicar en el VPS (Docker + Traefik)

Mismo procedimiento que `registro` y `wedding`. Dominio: `emaus.curiositylogic.cloud`.

1. **DNS.** Crear un registro **A** para `emaus.curiositylogic.cloud` apuntando a `72.61.15.127`.

2. **Clonar el repositorio en el servidor:**

   ```bash
   ssh root@72.61.15.127
   git clone https://github.com/edmartin-GIT/Emausglobal.git /opt/emausglobal
   ```

3. **Generar una contraseña de administrador:**

   ```bash
   openssl rand -base64 18
   ```

4. **Agregar el servicio a `/root/docker-compose.override.yml`.** Ese archivo ya existe porque lo creaste para `registro`: **no lo sobrescribas**, agrega el servicio dentro de `services:` y el volumen dentro de `volumes:`.

   ```bash
   nano /root/docker-compose.override.yml
   ```

   Bloque nuevo dentro de `services:`

   ```yaml
     emaus:
       build: /opt/emausglobal
       container_name: root-emaus-1
       restart: unless-stopped
       environment:
         - ADMIN_USER=admin
         - ADMIN_PASS=PEGAR-AQUI-LA-CONTRASEÑA
         - TZ=America/New_York
       volumes:
         - emaus_data:/data
       labels:
         - "traefik.enable=true"
         - "traefik.http.routers.emaus.rule=Host(`emaus.curiositylogic.cloud`)"
         - "traefik.http.routers.emaus.entrypoints=websecure"
         - "traefik.http.routers.emaus.tls.certresolver=mytlschallenge"
         - "traefik.http.services.emaus.loadbalancer.server.port=3000"
   ```

   Y en `volumes:` (junto a `registro_data` y los demás):

   ```yaml
     emaus_data:
   ```

   No se declara `networks:`: el servicio usa la red por defecto del proyecto, la misma de Traefik. Verificar:

   ```bash
   cd /root && docker compose config --services
   ```

   Debe aparecer `emaus` en la lista.

5. **Construir y arrancar:**

   ```bash
   cd /root && docker compose build emaus && docker compose up -d emaus
   docker logs root-emaus-1
   ```

   En el log deben salir `Datos iniciales cargados: 120 retiros.` y `Emaús Global escuchando en :3000`.

6. **Probar:** https://emaus.curiositylogic.cloud (el certificado HTTPS lo emite Traefik en el primer acceso, puede tardar uno o dos minutos).

## Actualizar después de cambios

```bash
cd /opt/emausglobal && git pull
cd /root && docker compose build emaus && docker compose up -d emaus
```

`docker compose restart` **no** actualiza los archivos: siempre reconstruir. Los retiros se conservan en el volumen `emaus_data`. El archivo `seed/retiros.json` solo se usa cuando la base está vacía; los cambios hechos desde el panel de administrador no se pierden al actualizar.

## Respaldo de la base de datos

```bash
docker cp root-emaus-1:/data/emaus.db ./emaus-$(date +%F).db
```

## Estructura

```
server.js          API y servidor web (Express + SQLite)
public/index.html  la página (filtros, vistas, ES/EN, panel de administrador)
seed/retiros.json  retiros iniciales
Dockerfile         imagen node:22-alpine
```

## API

- `GET /api/retiros` público, lista todos los retiros.
- `POST /api/admin/login` con `{user, pass}`, devuelve un token (12 h).
- `POST /api/propuestas` (público, límite 8 por hora y 300 pendientes): recibe una propuesta de retiro con los mismos campos de la base más `remitente` (correo opcional).
- `GET /api/admin/propuestas`, `PUT /api/admin/propuestas/:id`, `POST /api/admin/propuestas/:id/aprobar` (copia a `retiros` y borra la propuesta), `DELETE /api/admin/propuestas/:id` (descartar).
- `GET /api/retiros` incluye `pendientes` (true/false) para mostrar la señal junto al botón Administrador.
- `POST /api/admin/import/preview`: recibe el `.xlsx` (cuerpo binario, máx. 5 MB) y devuelve las filas interpretadas con errores, avisos y duplicados. No guarda nada.
- `POST /api/admin/import/commit`: recibe `{idioma, rows}` con las filas confirmadas y las inserta en `retiros` (omite duplicados por país + parroquia + fecha). Plantilla de ejemplo: `/plantilla_retiros.xlsx`.
- `POST /api/admin/retiros`, `PUT /api/admin/retiros/:id`, `DELETE /api/admin/retiros/:id` con el encabezado `Authorization: Bearer <token>`.
- `GET /health` para comprobar que el servicio responde.

## Aviso legal

© 2026 Curiosity Logic LLC. Todos los derechos reservados.
