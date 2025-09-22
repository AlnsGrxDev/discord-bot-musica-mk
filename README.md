# 🎵 Discord Music Bot

Un bot de música avanzado para Discord con soporte para múltiples plataformas.

## ✨ Características

- 🎵 **Reproducción desde YouTube** (URLs directas y búsquedas)
- 🎧 **Integración con Spotify** (tracks y playlists completas)
- 📋 **Sistema de cola avanzado** con múltiples canciones
- 🎮 **Comandos slash modernos** fáciles de usar
- 🔄 **Búsqueda inteligente** por nombre de canción/artista
- 💫 **Interfaz rica** con embeds informativos

## 🎮 Comandos disponibles

| Comando | Descripción | Ejemplo |
|---------|-------------|---------|
| `/play [query]` | Reproduce música desde YouTube, Spotify o búsqueda | `/play imagine dragons` |
| `/playlist [url]` | Añade playlist completa de Spotify | `/playlist https://open.spotify.com/playlist/...` |
| `/skip` | Salta a la siguiente canción | `/skip` |
| `/stop` | Detiene música y limpia cola | `/stop` |
| `/queue` | Muestra las canciones en cola | `/queue` |
| `/nowplaying` | Información de la canción actual | `/nowplaying` |
| `/leave` | El bot sale del canal de voz | `/leave` |

## 🚀 Fuentes de música soportadas

### ✅ Completamente soportado
- **YouTube** - URLs directas y búsquedas por texto
- **Spotify** - Tracks individuales y playlists (busca en YouTube para reproducir)

### ⚠️ Limitaciones
- **Spotify**: No streaming directo, convierte a búsquedas de YouTube
- **Apple Music**: No implementado aún

## 🛠️ Instalación

### Prerrequisitos
- Node.js 18 o superior
- Una aplicación de Discord creada
- Credenciales de Spotify API (opcional)

### 1. Clonar repositorio
```bash
git clone https://github.com/tu-usuario/discord-music-bot.git
cd discord-music-bot
```

### 2. Instalar dependencias
```bash
npm install
```

### 3. Configurar variables de entorno
Crea un archivo `.env` con:
```bash
TOKEN=tu_token_de_discord
CLIENT_ID=tu_client_id_de_discord
SPOTIFY_CLIENT_ID=tu_spotify_client_id
SPOTIFY_CLIENT_SECRET=tu_spotify_client_secret
```

### 4. Ejecutar el bot
```bash
npm start
```

## ⚙️ Configuración

### Discord Developer Portal
1. Ve a [Discord Developer Portal](https://discord.com/developers/applications)
2. Crea nueva aplicación
3. En "Bot": Crea bot y copia el TOKEN
4. En "General Information": Copia APPLICATION ID (CLIENT_ID)
5. En "OAuth2 → URL Generator": 
   - Scopes: `bot`, `applications.commands`
   - Permisos: `Connect`, `Speak`, `Use Slash Commands`

### Spotify Developer Dashboard (Opcional)
1. Ve a [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Crea nueva aplicación
3. Copia Client ID y Client Secret
4. Redirect URI: `http://localhost:3000`

## 🌐 Deploy en Render

### Variables de entorno en Render:
```
TOKEN = tu_token_de_discord
CLIENT_ID = tu_client_id_de_discord  
SPOTIFY_CLIENT_ID = tu_spotify_client_id
SPOTIFY_CLIENT_SECRET = tu_spotify_client_secret
```

### Configuración del servicio:
- **Build Command**: `npm install`
- **Start Command**: `npm start`
- **Node Version**: 18

## 📦 Dependencias

- `discord.js` - Interacción con Discord API
- `@discordjs/voice` - Manejo de audio en Discord
- `@discordjs/opus` - Codificador de audio
- `ytdl-core` - Descarga de audio desde YouTube
- `ytsr` - Búsquedas en YouTube
- `spotify-web-api-node` - Integración con Spotify

## 🎯 Ejemplos de uso

### Reproducir desde YouTube
```
/play https://www.youtube.com/watch?v=dQw4w9WgXcQ
/play imagine dragons believer
```

### Reproducir desde Spotify
```
/play https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh
```

### Añadir playlist de Spotify
```
/playlist https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M
```

## 🔧 Funcionalidades técnicas

- **Cola por servidor**: Cada servidor Discord tiene su propia cola
- **Reconexión automática**: Se reconecta automáticamente tras desconexiones
- **Búsqueda inteligente**: Encuentra canciones de Spotify en YouTube
- **Gestión de errores**: Manejo robusto de errores y logging
- **Rate limiting**: Protección contra spam de comandos

## 🐛 Solución de problemas

### El bot no responde
- Verifica que los tokens estén correctos
- Confirma que el bot tenga permisos en el servidor
- Revisa los logs para errores

### Error de permisos de voz
- El bot necesita permisos `Connect` y `Speak`
- Verifica que no esté limitado por roles

### Spotify no funciona
- Confirma que las credenciales de Spotify sean correctas
- Verifica que la aplicación esté configurada correctamente

## 📄 Licencia

MIT License - Puedes usar, modificar y distribuir este código libremente.

## 🤝 Contribuir

1. Fork el repositorio
2. Crea una rama para tu feature
3. Commit tus cambios
4. Push a la rama
5. Abre un Pull Request

## 📞 Soporte

Si tienes problemas o sugerencias, abre un issue en GitHub.

---

**¡Disfruta tu música! 🎵**
