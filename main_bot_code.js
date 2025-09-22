const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, EmbedBuilder } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus } = require('@discordjs/voice');
const ytdl = require('ytdl-core');
const ytsr = require('ytsr'); // Para buscar en YouTube
const spotifyWebApi = require('spotify-web-api-node'); // Para Spotify

// Configuración usando variables de entorno
const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

if (!TOKEN || !CLIENT_ID) {
    console.error('❌ Faltan variables de entorno TOKEN o CLIENT_ID');
    process.exit(1);
}

// Configurar cliente de Spotify
const spotifyApi = new spotifyWebApi({
    clientId: SPOTIFY_CLIENT_ID,
    clientSecret: SPOTIFY_CLIENT_SECRET
});

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
});

// Mapa para almacenar las colas de música por servidor
const queues = new Map();

// Clase para manejar la cola de música
class MusicQueue {
    constructor() {
        this.songs = [];
        this.playing = false;
        this.player = null;
        this.connection = null;
    }

    add(song) {
        this.songs.push(song);
    }

    next() {
        this.songs.shift();
        return this.songs[0];
    }

    clear() {
        this.songs = [];
    }
}

// Comandos slash actualizados
const commands = [
    new SlashCommandBuilder()
        .setName('play')
        .setDescription('Reproduce música desde múltiples fuentes')
        .addStringOption(option =>
            option.setName('query')
                .setDescription('URL de YouTube, Spotify, o términos de búsqueda')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('playlist')
        .setDescription('Reproduce una playlist completa')
        .addStringOption(option =>
            option.setName('url')
                .setDescription('URL de playlist de Spotify')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('skip')
        .setDescription('Salta a la siguiente canción'),
    new SlashCommandBuilder()
        .setName('stop')
        .setDescription('Detiene la música y limpia la cola'),
    new SlashCommandBuilder()
        .setName('queue')
        .setDescription('Muestra la cola de reproducción'),
    new SlashCommandBuilder()
        .setName('nowplaying')
        .setDescription('Muestra la canción actual'),
    new SlashCommandBuilder()
        .setName('leave')
        .setDescription('El bot sale del canal de voz')
];

// Función para autenticar con Spotify
async function authenticateSpotify() {
    if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
        console.log('⚠️ Spotify no configurado - solo funcionará YouTube');
        return;
    }

    try {
        const data = await spotifyApi.clientCredentialsGrant();
        spotifyApi.setAccessToken(data.body['access_token']);
        console.log('✅ Spotify autenticado correctamente');
        
        // Renovar token cada 50 minutos
        setTimeout(authenticateSpotify, 50 * 60 * 1000);
    } catch (error) {
        console.error('❌ Error autenticando Spotify:', error.message);
    }
}

// Función para detectar el tipo de URL
function detectURLType(url) {
    if (url.includes('open.spotify.com')) {
        if (url.includes('/track/')) return 'spotify_track';
        if (url.includes('/playlist/') || url.includes('/album/')) return 'spotify_playlist';
    }
    if (url.includes('music.apple.com')) {
        return 'apple_music';
    }
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
        if (url.includes('list=')) return 'youtube_playlist';
        return 'youtube_video';
    }
    return 'search';
}

// Función para extraer ID de Spotify
function extractSpotifyId(url) {
    const match = url.match(/(?:track|playlist|album)\/([a-zA-Z0-9]+)/);
    return match ? match[1] : null;
}

// Función para buscar en YouTube
async function searchYouTube(query) {
    try {
        console.log(`🔍 Buscando en YouTube: ${query}`);
        const searchResults = await ytsr(query, { limit: 5 });
        const video = searchResults.items.find(item => item.type === 'video' && item.duration);
        
        if (!video) {
            throw new Error('No se encontró la canción en YouTube');
        }
        
        const info = await ytdl.getInfo(video.url);
        return {
            title: info.videoDetails.title,
            url: info.videoDetails.video_url,
            duration: formatDuration(info.videoDetails.lengthSeconds),
            thumbnail: info.videoDetails.thumbnails[0]?.url || null,
            source: 'YouTube'
        };
    } catch (error) {
        console.error('Error en búsqueda de YouTube:', error.message);
        throw new Error(`No se pudo buscar en YouTube: ${error.message}`);
    }
}

// Función para obtener track de Spotify
async function getSpotifyTrack(trackId) {
    try {
        console.log(`🎵 Obteniendo track de Spotify: ${trackId}`);
        const track = await spotifyApi.getTrack(trackId);
        const query = `${track.body.artists[0].name} ${track.body.name}`;
        
        const youtubeResult = await searchYouTube(query);
        return {
            ...youtubeResult,
            originalTitle: track.body.name,
            artist: track.body.artists[0].name,
            source: 'Spotify → YouTube',
            spotifyUrl: track.body.external_urls.spotify
        };
    } catch (error) {
        console.error('Error obteniendo track de Spotify:', error.message);
        throw new Error(`Error con Spotify: ${error.message}`);
    }
}

// Función para obtener playlist de Spotify
async function getSpotifyPlaylist(playlistId) {
    try {
        console.log(`📋 Obteniendo playlist de Spotify: ${playlistId}`);
        const playlist = await spotifyApi.getPlaylist(playlistId);
        const tracks = [];
        let successCount = 0;
        
        console.log(`📋 Procesando ${playlist.body.tracks.items.length} canciones...`);
        
        for (let i = 0; i < playlist.body.tracks.items.length && i < 50; i++) { // Límite de 50 canciones
            const item = playlist.body.tracks.items[i];
            
            if (item.track && item.track.name) {
                const query = `${item.track.artists[0].name} ${item.track.name}`;
                try {
                    const youtubeResult = await searchYouTube(query);
                    tracks.push({
                        ...youtubeResult,
                        originalTitle: item.track.name,
                        artist: item.track.artists[0].name,
                        source: 'Spotify → YouTube'
                    });
                    successCount++;
                    
                    // Pequeña pausa para evitar rate limiting
                    if (i % 5 === 0 && i > 0) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                } catch (error) {
                    console.log(`⚠️ No se encontró: ${query}`);
                }
            }
        }
        
        return {
            name: playlist.body.name,
            tracks: tracks,
            totalTracks: playlist.body.tracks.total,
            foundTracks: successCount
        };
    } catch (error) {
        console.error('Error obteniendo playlist de Spotify:', error.message);
        throw new Error(`Error con playlist de Spotify: ${error.message}`);
    }
}

// Función para obtener información de canción
async function getSongInfo(query, requester) {
    const urlType = detectURLType(query);
    
    try {
        let songInfo;
        
        switch (urlType) {
            case 'youtube_video':
                if (!ytdl.validateURL(query)) {
                    throw new Error('URL de YouTube inválida');
                }
                console.log('🎵 Procesando URL de YouTube...');
                const info = await ytdl.getInfo(query);
                songInfo = {
                    title: info.videoDetails.title,
                    url: info.videoDetails.video_url,
                    duration: formatDuration(info.videoDetails.lengthSeconds),
                    thumbnail: info.videoDetails.thumbnails[0]?.url || null,
                    source: 'YouTube'
                };
                break;
                
            case 'spotify_track':
                const spotifyId = extractSpotifyId(query);
                if (!spotifyId) throw new Error('ID de Spotify inválido');
                songInfo = await getSpotifyTrack(spotifyId);
                break;
                
            case 'search':
                console.log('🔍 Realizando búsqueda...');
                songInfo = await searchYouTube(query);
                break;
                
            default:
                throw new Error('Tipo de URL no soportado. Usa YouTube, Spotify o haz una búsqueda por texto.');
        }
        
        songInfo.requester = requester;
        return songInfo;
        
    } catch (error) {
        console.error('Error en getSongInfo:', error.message);
        throw new Error(`Error procesando: ${error.message}`);
    }
}

// Función para formatear duración
function formatDuration(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

// Función para reproducir música
async function playSong(interaction, queue) {
    if (queue.songs.length === 0) {
        queue.playing = false;
        console.log('Cola vacía, deteniendo reproducción');
        return;
    }

    const song = queue.songs[0];
    queue.playing = true;
    
    console.log(`▶️ Reproduciendo: ${song.title}`);

    try {
        // Crear stream de audio
        const stream = ytdl(song.url, {
            filter: 'audioonly',
            highWaterMark: 1 << 25,
            quality: 'highestaudio'
        });

        const resource = createAudioResource(stream, {
            inputType: 'arbitrary'
        });

        // Configurar el reproductor de audio
        if (!queue.player) {
            queue.player = createAudioPlayer();
            
            queue.player.on(AudioPlayerStatus.Idle, () => {
                console.log('🎵 Canción terminada, siguiente...');
                queue.next();
                if (queue.songs.length > 0) {
                    playSong(interaction, queue);
                } else {
                    queue.playing = false;
                    console.log('📭 Cola vacía');
                }
            });

            queue.player.on('error', error => {
                console.error('❌ Error en el reproductor:', error.message);
                queue.next();
                if (queue.songs.length > 0) {
                    playSong(interaction, queue);
                }
            });

            queue.connection.subscribe(queue.player);
        }

        // Reproducir la canción
        queue.player.play(resource);

        // Crear embed de "reproduciendo"
        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('🎵 Reproduciendo')
            .setDescription(`**${song.title}**`)
            .addFields(
                { name: '⏱️ Duración', value: song.duration || 'Desconocida', inline: true },
                { name: '📺 Fuente', value: song.source || 'YouTube', inline: true },
                { name: '👤 Solicitado por', value: song.requester.toString(), inline: true }
            )
            .setTimestamp();

        if (song.thumbnail) {
            embed.setThumbnail(song.thumbnail);
        }

        if (interaction && (interaction.replied || interaction.deferred)) {
            await interaction.followUp({ embeds: [embed] });
        }

    } catch (error) {
        console.error('❌ Error al reproducir:', error.message);
        
        // Si hay error, intentar la siguiente canción
        queue.next();
        if (queue.songs.length > 0) {
            setTimeout(() => playSong(interaction, queue), 1000);
        } else {
            queue.playing = false;
        }
    }
}

// Evento: Bot listo
client.once('ready', async () => {
    console.log(`🎵 ${client.user.tag} está listo para reproducir música!`);
    console.log(`🔗 Invita el bot: https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&permissions=3147776&scope=bot%20applications.commands`);
    
    // Autenticar Spotify si está configurado
    await authenticateSpotify();
});

// Evento: Comandos de interacción
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;
    const guildId = interaction.guild.id;
    const voiceChannel = interaction.member.voice.channel;

    console.log(`🎮 Comando ejecutado: /${commandName} por ${interaction.user.tag}`);

    switch (commandName) {
        case 'play':
            // Verificar canal de voz
            if (!voiceChannel) {
                return interaction.reply({
                    content: '❌ **Debes estar en un canal de voz para usar este comando.**',
                    ephemeral: true
                });
            }

            await interaction.deferReply();

            try {
                const query = interaction.options.getString('query');
                console.log(`🎵 Procesando: ${query}`);
                
                const songInfo = await getSongInfo(query, interaction.user);

                // Obtener o crear cola para este servidor
                if (!queues.has(guildId)) {
                    queues.set(guildId, new MusicQueue());
                }
                const queue = queues.get(guildId);

                // Unirse al canal de voz si no está conectado
                if (!queue.connection) {
                    try {
                        queue.connection = joinVoiceChannel({
                            channelId: voiceChannel.id,
                            guildId: guildId,
                            adapterCreator: interaction.guild.voiceAdapterCreator,
                        });

                        queue.connection.on(VoiceConnectionStatus.Disconnected, () => {
                            console.log('🔌 Desconectado del canal de voz');
                            queue.connection = null;
                            queue.player = null;
                            queue.clear();
                        });

                        queue.connection.on('error', error => {
                            console.error('❌ Error de conexión:', error);
                        });

                        console.log(`🔊 Conectado a: ${voiceChannel.name}`);
                    } catch (error) {
                        console.error('❌ Error conectando al canal:', error);
                        return interaction.editReply('❌ No pude conectarme al canal de voz.');
                    }
                }

                // Añadir canción a la cola
                queue.add(songInfo);
                console.log(`➕ Añadido a la cola: ${songInfo.title}`);

                // Si no está reproduciendo, empezar
                if (!queue.playing) {
                    playSong(interaction, queue);
                } else {
                    // Mostrar que se añadió a la cola
                    const embed = new EmbedBuilder()
                        .setColor('#00ff00')
                        .setTitle('✅ Añadido a la cola')
                        .setDescription(`**${songInfo.title}**`)
                        .addFields(
                            { name: '📍 Posición en cola', value: `#${queue.songs.length}`, inline: true },
                            { name: '📺 Fuente', value: songInfo.source || 'YouTube', inline: true },
                            { name: '⏱️ Duración', value: songInfo.duration || 'Desconocida', inline: true }
                        )
                        .setTimestamp();
                    
                    if (songInfo.thumbnail) {
                        embed.setThumbnail(songInfo.thumbnail);
                    }
                    
                    await interaction.editReply({ embeds: [embed] });
                }

            } catch (error) {
                console.error('❌ Error en comando play:', error.message);
                const errorEmbed = new EmbedBuilder()
                    .setColor('#ff0000')
                    .setTitle('❌ Error')
                    .setDescription(error.message)
                    .setTimestamp();
                
                await interaction.editReply({ embeds: [errorEmbed] });
            }
            break;

        case 'playlist':
            if (!voiceChannel) {
                return interaction.reply({
                    content: '❌ **Debes estar en un canal de voz para usar este comando.**',
                    ephemeral: true
                });
            }

            await interaction.deferReply();

            try {
                const url = interaction.options.getString('url');
                const urlType = detectURLType(url);

                if (urlType !== 'spotify_playlist') {
                    throw new Error('❌ Solo se soportan playlists de Spotify por ahora.\n📋 Ejemplo: `https://open.spotify.com/playlist/...`');
                }

                const playlistId = extractSpotifyId(url);
                if (!playlistId) {
                    throw new Error('❌ ID de playlist de Spotify inválido.');
                }

                // Mostrar progreso
                const progressEmbed = new EmbedBuilder()
                    .setColor('#1DB954')
                    .setTitle('⏳ Procesando playlist...')
                    .setDescription('Esto puede tomar unos momentos...')
                    .setTimestamp();
                
                await interaction.editReply({ embeds: [progressEmbed] });

                const playlistData = await getSpotifyPlaylist(playlistId);
                
                if (playlistData.tracks.length === 0) {
                    throw new Error('❌ No se encontraron canciones reproducibles en esta playlist.');
                }

                // Configurar cola y conexión
                if (!queues.has(guildId)) {
                    queues.set(guildId, new MusicQueue());
                }
                const queue = queues.get(guildId);

                if (!queue.connection) {
                    queue.connection = joinVoiceChannel({
                        channelId: voiceChannel.id,
                        guildId: guildId,
                        adapterCreator: interaction.guild.voiceAdapterCreator,
                    });

                    queue.connection.on(VoiceConnectionStatus.Disconnected, () => {
                        queue.connection = null;
                        queue.player = null;
                        queue.clear();
                    });
                }

                // Añadir todas las canciones encontradas
                playlistData.tracks.forEach(track => {
                    track.requester = interaction.user;
                    queue.add(track);
                });

                // Crear embed de éxito
                const successEmbed = new EmbedBuilder()
                    .setColor('#1DB954')
                    .setTitle('✅ Playlist añadida')
                    .setDescription(`**${playlistData.name}**`)
                    .addFields(
                        { name: '🎵 Canciones encontradas', value: `${playlistData.foundTracks}`, inline: true },
                        { name: '📊 Total en playlist', value: `${playlistData.totalTracks}`, inline: true },
                        { name: '⚡ Estado', value: queue.playing ? 'Añadido a cola' : 'Reproduciendo ahora', inline: true }
                    )
                    .setTimestamp();

                await interaction.editReply({ embeds: [successEmbed] });

                // Empezar a reproducir si no está reproduciendo
                if (!queue.playing && queue.songs.length > 0) {
                    playSong(interaction, queue);
                }

            } catch (error) {
                console.error('❌ Error en comando playlist:', error.message);
                const errorEmbed = new EmbedBuilder()
                    .setColor('#ff0000')
                    .setTitle('❌ Error con playlist')
                    .setDescription(error.message)
                    .setTimestamp();
                
                await interaction.editReply({ embeds: [errorEmbed] });
            }
            break;

        case 'skip':
            const skipQueue = queues.get(guildId);
            if (!skipQueue || !skipQueue.playing) {
                return interaction.reply({
                    content: '❌ **No hay música reproduciéndose.**',
                    ephemeral: true
                });
            }

            const skippedSong = skipQueue.songs[0];
            skipQueue.player.stop(); // Esto activará el evento 'idle'
            
            const skipEmbed = new EmbedBuilder()
                .setColor('#ffaa00')
                .setTitle('⏭️ Canción saltada')
                .setDescription(skippedSong ? `~~${skippedSong.title}~~` : 'Canción actual')
                .addFields(
                    { name: '📊 Cola restante', value: `${skipQueue.songs.length - 1} canciones`, inline: true }
                )
                .setTimestamp();

            interaction.reply({ embeds: [skipEmbed] });
            break;

        case 'stop':
            const stopQueue = queues.get(guildId);
            if (!stopQueue || !stopQueue.playing) {
                return interaction.reply({
                    content: '❌ **No hay música reproduciéndose.**',
                    ephemeral: true
                });
            }

            const songsCleared = stopQueue.songs.length;
            stopQueue.clear();
            stopQueue.player.stop();
            
            const stopEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('⏹️ Música detenida')
                .setDescription('Cola limpiada y reproducción detenida.')
                .addFields(
                    { name: '🗑️ Canciones eliminadas', value: `${songsCleared}`, inline: true }
                )
                .setTimestamp();

            interaction.reply({ embeds: [stopEmbed] });
            break;

        case 'queue':
            const viewQueue = queues.get(guildId);
            if (!viewQueue || viewQueue.songs.length === 0) {
                return interaction.reply({
                    content: '❌ **La cola está vacía.**\n💡 Usa `/play` para añadir música.',
                    ephemeral: true
                });
            }

            const queueList = viewQueue.songs
                .slice(0, 10) // Mostrar solo las primeras 10
                .map((song, index) => {
                    const status = index === 0 ? '🎵' : `${index}.`;
                    const title = song.title.length > 60 ? song.title.substring(0, 60) + '...' : song.title;
                    const source = song.source ? `(${song.source})` : '';
                    return `${status} **${title}** ${source}`;
                })
                .join('\n');

            const queueEmbed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('🎵 Cola de reproducción')
                .setDescription(queueList)
                .addFields(
                    { name: '📊 Total', value: `${viewQueue.songs.length} canciones`, inline: true },
                    { name: '⏱️ Estado', value: viewQueue.playing ? '▶️ Reproduciendo' : '⏸️ Pausado', inline: true }
                )
                .setTimestamp();

            if (viewQueue.songs.length > 10) {
                queueEmbed.setFooter({ text: `... y ${viewQueue.songs.length - 10} canciones más` });
            }

            interaction.reply({ embeds: [queueEmbed] });
            break;

        case 'nowplaying':
            const npQueue = queues.get(guildId);
            if (!npQueue || !npQueue.playing || npQueue.songs.length === 0) {
                return interaction.reply({
                    content: '❌ **No hay música reproduciéndose.**',
                    ephemeral: true
                });
            }

            const currentSong = npQueue.songs[0];
            const npEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('🎵 Reproduciendo ahora')
                .setDescription(`**${currentSong.title}**`)
                .addFields(
                    { name: '⏱️ Duración', value: currentSong.duration || 'Desconocida', inline: true },
                    { name: '📺 Fuente', value: currentSong.source || 'YouTube', inline: true },
                    { name: '👤 Solicitado por', value: currentSong.requester.toString(), inline: true },
                    { name: '📊 Siguientes en cola', value: `${npQueue.songs.length - 1} canciones`, inline: true }
                )
                .setTimestamp();

            if (currentSong.thumbnail) {
                npEmbed.setThumbnail(currentSong.thumbnail);
            }

            // Agregar artista si es de Spotify
            if (currentSong.artist) {
                npEmbed.addFields({ name: '🎤 Artista', value: currentSong.artist, inline: true });
            }

            interaction.reply({ embeds: [npEmbed] });
            break;

        case 'leave':
            const leaveQueue = queues.get(guildId);
            if (!leaveQueue || !leaveQueue.connection) {
                return interaction.reply({
                    content: '❌ **No estoy conectado a ningún canal de voz.**',
                    ephemeral: true
                });
            }

            const channelName = voiceChannel ? voiceChannel.name : 'canal de voz';
            leaveQueue.connection.destroy();
            queues.delete(guildId);
            
            const leaveEmbed = new EmbedBuilder()
                .setColor('#ffaa00')
                .setTitle('👋 Desconectado')
                .setDescription(`He salido del canal **${channelName}**`)
                .setTimestamp();

            interaction.reply({ embeds: [leaveEmbed] });
            console.log(`🚪 Desconectado del servidor: ${interaction.guild.name}`);
            break;

        default:
            interaction.reply({
                content: '❌ **Comando no reconocido.**',
                ephemeral: true
            });
            break;
    }
});

// Evento: Manejo de errores
client.on('error', error => {
    console.error('❌ Error del cliente Discord:', error);
});

process.on('unhandledRejection', error => {
    console.error('❌ Error no manejado:', error);
});

// Registrar comandos slash
async function registerCommands() {
    const rest = new REST({ version: '10' }).setToken(TOKEN);

    try {
        console.log('🔄 Registrando comandos slash...');

        await rest.put(
            Routes.applicationCommands(CLIENT_ID),
            { body: commands }
        );

        console.log('✅ Comandos registrados exitosamente!');
    } catch (error) {
        console.error('❌ Error al registrar comandos:', error);
    }
}

// Iniciar el bot
async function startBot() {
    try {
        console.log('🚀 Iniciando bot...');
        await registerCommands();
        await client.login(TOKEN);
        console.log('✅ Bot iniciado correctamente!');
    } catch (error) {
        console.error('❌ Error al iniciar el bot:', error);
        process.exit(1);
    }
}

// Manejar cierre graceful
process.on('SIGINT', () => {
    console.log('🛑 Cerrando bot...');
    client.destroy();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('🛑 Cerrando bot...');
    client.destroy();
    process.exit(0);
});

// Iniciar el bot
startBot();