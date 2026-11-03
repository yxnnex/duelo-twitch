const express = require('express');
const tmi = require('tmi.js');
const crypto = require('crypto');
const path = require('path');

// ==========================================
// CONFIGURACIÓN (todo lo sensible va por variables de entorno)
// ==========================================
const USERNAME = process.env.TWITCH_USERNAME || 's2kyli';
const OAUTH_TOKEN = process.env.TWITCH_OAUTH;      // ej: oauth:xxxxxxxx
const API_KEY = (process.env.API_KEY || '').trim(); // clave para /duelo y /amor
const CLIENT_ID = process.env.TWITCH_CLIENT_ID;    // para los shoutouts (API de Twitch)
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;     // para guardar estadísticas de duelos
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const ADMIN_PASSWORD = (process.env.ADMIN_PASSWORD || '').trim(); // contraseña del panel /admin
const PORT = process.env.PORT || 10000;
const CANALES = ['s2yone', 'vladsuo'].map((c) => c.replace(/^#/, '').toLowerCase());

if (!OAUTH_TOKEN) {
  console.error('❌ Falta la variable de entorno TWITCH_OAUTH');
  process.exit(1);
}
if (!API_KEY) {
  console.warn('⚠️ Falta API_KEY: los endpoints /duelo y /amor van a rechazar todas las peticiones.');
}

if (!CLIENT_ID) {
  console.warn('⚠️ Falta TWITCH_CLIENT_ID: el shoutout oficial está desactivado (solo se agradece el raid en el chat).');
}
if (!REDIS_URL || !REDIS_TOKEN) {
  console.warn('⚠️ Sin Upstash: las estadísticas de duelos se guardan en memoria y se pierden al reiniciar.');
}

if (!ADMIN_PASSWORD) {
  console.warn('⚠️ Falta ADMIN_PASSWORD: el panel de preguntas (/admin) está desactivado.');
}

const client = new tmi.Client({
  options: { debug: false },
  identity: {
    username: USERNAME,
    password: OAUTH_TOKEN.startsWith('oauth:') ? OAUTH_TOKEN : `oauth:${OAUTH_TOKEN}`
  },
  channels: CANALES
});

client.connect().catch(console.error);

// ==========================================
// UTILIDADES
// ==========================================
const BOTS_IGNORADOS = new Set(['streamelements', 'nightbot', 'moobot', 'fossabot']);

// Minúsculas + sin tildes (ñ -> n) para comparar respuestas y comandos
const normalizar = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Evita que un parámetro externo inyecte comandos de Twitch y limpia arrobas o asteriscos extra
const limpiar = (s, max = 30) =>
  String(s || '').replace(/^[\s/.\\]+/, '').replace(/^@+/, '').slice(0, max).trim();

// Enviar mensaje sin que un error tire abajo el bot
async function decir(canal, mensaje) {
  try {
    await client.say(canal, mensaje);
  } catch (e) {
    console.error(`Error enviando mensaje a ${canal}:`, e.message || e);
  }
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function pedirTexto(url, ms = 8000) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36' },
    signal: AbortSignal.timeout(ms)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// ==========================================
// API DE TWITCH (SHOUTOUT OFICIAL)
// ==========================================
const TOKEN_API = OAUTH_TOKEN.replace(/^oauth:/, '');
const idsCache = new Map();

async function helix(ruta, metodo = 'GET') {
  const res = await fetch(`https://api.twitch.tv/helix${ruta}`, {
    method: metodo,
    headers: { 'Client-Id': CLIENT_ID, Authorization: `Bearer ${TOKEN_API}` },
    signal: AbortSignal.timeout(8000)
  });
  if (!res.ok) {
    const detalle = await res.text().catch(() => '');
    throw new Error(`Twitch API ${res.status}: ${detalle}`);
  }
  return res.status === 204 ? null : res.json();
}

async function idDeUsuario(login) {
  login = login.toLowerCase();
  if (idsCache.has(login)) return idsCache.get(login);

  const data = await helix(`/users?login=${encodeURIComponent(login)}`);
  const id = data && data.data && data.data[0] && data.data[0].id;
  if (!id) throw new Error(`No encontré al usuario ${login}`);

  idsCache.set(login, id);
  return id;
}

async function hacerShoutout(canal, raider) {
  const [desde, hacia, moderador] = await Promise.all([
    idDeUsuario(canal.replace('#', '')),
    idDeUsuario(raider),
    idDeUsuario(USERNAME)
  ]);
  await helix(
    `/chat/shoutouts?from_broadcaster_id=${desde}&to_broadcaster_id=${hacia}&moderator_id=${moderador}`,
    'POST'
  );
}

// ==========================================
// ESTADÍSTICAS DE DUELOS
// ==========================================
const usaRedis = Boolean(REDIS_URL && REDIS_TOKEN);
const memoria = new Map();

async function redisCmd(...args) {
  const res = await fetch(REDIS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(8000)
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.result;
}

async function sumar(clave, usuario) {
  if (usaRedis) return redisCmd('HINCRBY', clave, usuario, 1);
  const m = memoria.get(clave) || new Map();
  memoria.set(clave, m);
  m.set(usuario, (m.get(usuario) || 0) + 1);
}

async function top3(clave) {
  let pares = [];
  if (usaRedis) {
    const r = await redisCmd('HGETALL', clave);
    if (Array.isArray(r)) {
      for (let i = 0; i < r.length; i += 2) pares.push([r[i], Number(r[i + 1])]);
    } else if (r) {
      pares = Object.entries(r).map(([u, n]) => [u, Number(n)]);
    }
  } else {
    pares = [...(memoria.get(clave) || new Map())];
  }
  return pares.sort((a, b) => b[1] - a[1]).slice(0, 3);
}

const nombreValido = (u) => /^[a-z0-9_]{2,25}$/.test(u);

async function registrarDuelo(canal, ganador, perdedor) {
  const c = canal.replace('#', '');
  try {
    await Promise.all([
      sumar(`duelo:${c}:victorias`, ganador),
      sumar(`duelo:${c}:derrotas`, perdedor)
    ]);
  } catch (e) {
    console.error('Error guardando el duelo:', e.message);
  }
}

async function mensajeTopDuelos(canal) {
  const c = canal.replace('#', '');
  try {
    const [gana, pierde] = await Promise.all([
      top3(`duelo:${c}:victorias`),
      top3(`duelo:${c}:derrotas`)
    ]);
    if (!gana.length && !pierde.length) {
      return ['Todavía no hay duelos registrados. ¡Usen !duelo para empezar! catSmash'];
    }
    const formatear = (lista) =>
      lista.length ? lista.map(([u, n], i) => `${i + 1}° ${u} (${n})`).join(' | ') : 'sin datos';
    return [
      `TOP VICTORIAS: ${formatear(gana)}`,
      `TOP DERROTAS: ${formatear(pierde)}`
    ];
  } catch (e) {
    console.error('Error leyendo estadísticas:', e.message);
    return ['No pude leer las estadísticas de duelos ahora mismo catDespair'];
  }
}

// ==========================================
// PREGUNTAS DE TRIVIA EDITABLES (panel /admin)
// ==========================================
const CLAVE_PREGUNTAS = 'trivia:preguntas';
const preguntasMemoria = new Map();
let cachePreguntas = null;
let cacheHasta = 0;

async function leerPreguntas() {
  let pares = [];
  if (usaRedis) {
    const r = await redisCmd('HGETALL', CLAVE_PREGUNTAS);
    if (Array.isArray(r)) {
      for (let i = 0; i < r.length; i += 2) pares.push([r[i], r[i + 1]]);
    } else if (r) {
      pares = Object.entries(r);
    }
  } else {
    pares = [...preguntasMemoria];
  }
  const lista = [];
  for (const [id, json] of pares) {
    try {
      const q = JSON.parse(json);
      if (q && q.pregunta && Array.isArray(q.respuestas) && q.respuestas.length) {
        lista.push({ id, pregunta: q.pregunta, respuestas: q.respuestas });
      }
    } catch (e) { /* se ignora una entrada dañada */ }
  }
  return lista.sort((a, b) => a.id.localeCompare(b.id));
}

async function agregarPreguntas(lista) {
  const campos = lista.map((q) => [
    `${Date.now().toString(36).padStart(9, '0')}${Math.random().toString(36).slice(2, 6)}`,
    JSON.stringify({ pregunta: q.pregunta, respuestas: q.respuestas })
  ]);
  if (!campos.length) return;
  if (usaRedis) await redisCmd('HSET', CLAVE_PREGUNTAS, ...campos.flat());
  else campos.forEach(([id, json]) => preguntasMemoria.set(id, json));
  cachePreguntas = null;
}

async function borrarPregunta(id) {
  if (usaRedis) await redisCmd('HDEL', CLAVE_PREGUNTAS, id);
  else preguntasMemoria.delete(id);
  cachePreguntas = null;
}

async function borrarTodasLasPreguntas() {
  if (usaRedis) await redisCmd('DEL', CLAVE_PREGUNTAS);
  else preguntasMemoria.clear();
  cachePreguntas = null;
}

async function bancoActivo() {
  if (cachePreguntas && Date.now() < cacheHasta) return cachePreguntas;
  try {
    const propias = await leerPreguntas();
    cachePreguntas = propias.length ? propias : BANCO;
    cacheHasta = Date.now() + 30 * 1000;
    return cachePreguntas;
  } catch (e) {
    console.error('Error leyendo preguntas:', e.message);
    return BANCO;
  }
}

function parsearLineas(texto) {
  const validas = [];
  const errores = [];
  String(texto || '').split(/\r?\n/).forEach((linea, i) => {
    if (!linea.trim()) return;
    const [preg, resp] = linea.split('|');
    const pregunta = (preg || '').trim();
    const respuestas = (resp || '').split(',').map((r) => r.trim()).filter(Boolean);
    if (!pregunta || pregunta.length > 300 || !respuestas.length || respuestas.length > 10 || respuestas.some((r) => r.length > 60)) {
      errores.push(i + 1);
    } else {
      validas.push({ pregunta, respuestas });
    }
  });
  return { validas, errores };
}

// ==========================================
// ESTADO POR CANAL
// ==========================================
const estados = new Map();

function estadoDe(canal) {
  if (!estados.has(canal)) {
    estados.set(canal, {
      trivia: null,
      usadas: [],
      dueloActivo: false
    });
  }
  return estados.get(canal);
}

// ==========================================
// MENSAJES AUTOMÁTICOS CADA 20 MINUTOS
// ==========================================
const MENSAJES_AUTO = ['CatCozy', 'Erm', 'holasinofender', 'aaa'];
const INTERVALO_AUTO = 20 * 60 * 1000; // 20 minutos
const ultimoAuto = new Map(); // canal -> último mensaje enviado

if (!CLIENT_ID) {
  console.warn('⚠️ Sin TWITCH_CLIENT_ID no se puede saber si el canal está en vivo: los mensajes automáticos están desactivados.');
}

async function canalEnVivo(canal) {
  const login = canal.replace(/^#/, '').toLowerCase();
  const data = await helix(`/streams?user_login=${encodeURIComponent(login)}`);
  return Boolean(data && data.data && data.data.length);
}

async function mensajesAutomaticos() {
  if (!CLIENT_ID) return;

  for (const canal of CANALES) {
    try {
      if (!(await canalEnVivo(canal))) {
        console.log(`[AUTO] ${canal}: offline, no se envía nada`);
        continue;
      }

      // Filtra para no repetir el último mensaje enviado en ese canal
      const opciones = MENSAJES_AUTO.filter((m) => m !== ultimoAuto.get(canal));
      const elegido = opciones[Math.floor(Math.random() * opciones.length)];
      ultimoAuto.set(canal, elegido);
      await decir(`#${canal}`, elegido);
      console.log(`[AUTO] ${canal}: en vivo, se envió "${elegido}"`);
    } catch (e) {
      console.error(`[AUTO] No pude revisar si ${canal} está en vivo:`, e.message);
    }
  }
}

setInterval(mensajesAutomaticos, INTERVALO_AUTO);
console.log(`[AUTO] Mensajes automáticos cada ${INTERVALO_AUTO / 60000} minutos (solo con el canal en vivo)`);

// ==========================================
// BANCO DE TRIVIA
// ==========================================
const BANCO = [
  { pregunta: '🎮 ¿Cuál es el nombre del hermano de Yone?', respuestas: ['yasuo'] },
  { pregunta: '🎮 ¿Quién es la hermana menor de Garen?', respuestas: ['lux'] },
  { pregunta: '🎮 ¿Cómo se llama la ciudad subterránea y contaminada de Runaterra donde creció Jinx?', respuestas: ['zaun'] },
  { pregunta: '🎮 ¿Cómo se llama el osito de peluche que lleva Annie a la batalla?', respuestas: ['tibbers'] },
  { pregunta: '🎮 ¿Cómo se llama el arco legendario que utiliza Ashe?', respuestas: ['avarosa', 'arco de avarosa'] },
  { pregunta: '🎮 ¿Qué clase o rol de campeón es Poppy según su kit?', respuestas: ['tanque', 'tank'] },
  { pregunta: '🎮 ¿Qué campeón usa un farol y es conocido por atrapar almas?', respuestas: ['thresh'] },
  { pregunta: '🎮 ¿Cómo se llama el monstruo épico más poderoso del mapa, que da un buff a todo el equipo?', respuestas: ['baron nashor', 'baron', 'nashor'] },
  { pregunta: '🎮 ¿Cuál es el nombre del campeón dragón creador de estrellas?', respuestas: ['aurelion sol', 'aurelion'] },
  { pregunta: '🎮 ¿Cómo se llama la ciudad próspera y tecnológica de Runaterra, hogar de Jayce y Caitlyn?', respuestas: ['piltover'] },
  { pregunta: '🎮 ¿Cómo se llama la habilidad definitiva (R) de Yone?', respuestas: ['sello del destino', 'sello de destino'] },
  { pregunta: '🎮 ¿Qué campeón de LoL es un demonio del miedo y usa una guadaña?', respuestas: ['fiddlesticks', 'fiddle'] },
  { pregunta: '🎮 ¿Cómo se llama el mapa clásico donde se juegan las partidas 5v5 de LoL?', respuestas: ['grieta del invocador', 'grieta'] },
  { pregunta: '🎮 ¿Qué campeón tirador dispara solo cuatro balas y su arma se llama "Susurro"?', respuestas: ['jhin'] },
  { pregunta: '🎮 ¿Cómo se llama el monstruo neutral que aparece en el mapa antes del Barón Nashor?', respuestas: ['heraldo', 'heraldo de la grieta', 'larva', 'vacuo'] },
  { pregunta: '⚽ ¿Cuántos Balones de Oro ganó Cristiano Ronaldo?', respuestas: ['5', 'cinco'] },
  { pregunta: '⚽ ¿Qué selección ganó la Copa del Mundo Qatar 2022?', respuestas: ['argentina', 'la scaloneta', 'albiceleste'] },
  { pregunta: '⚽ ¿En qué club europeo debutó profesionalmente Cristiano Ronaldo?', respuestas: ['sporting de lisboa', 'sporting', 'lisboa'] },
  { pregunta: '⚽ ¿En qué club juega Kylian Mbappé desde 2024?', respuestas: ['real madrid', 'madrid'] },
  { pregunta: '⚽ ¿Qué país ganó la Eurocopa 2024?', respuestas: ['españa'] },
  { pregunta: '⚽ ¿Cuál es el clásico rival del Real Madrid en España?', respuestas: ['barcelona', 'barsa', 'barca'] },
  { pregunta: '⚽ ¿En qué estadio juega de local la Selección Argentina?', respuestas: ['monumental'] },
  { pregunta: '⚽ ¿Qué dorsal caracteriza históricamente a Cristiano Ronaldo?', respuestas: ['7', 'siete'] },
  { pregunta: '⚽ ¿Qué apodo recibe Kylian Mbappé por su velocidad en la cancha?', respuestas: ['tortuga', 'donatello'] },
  { pregunta: '⚽ ¿Qué selección ganó la Copa América 2021 jugada en Brasil?', respuestas: ['argentina', 'la scaloneta', 'albiceleste'] },
  { pregunta: '⚽ ¿En qué club de la Premier League juega Erling Haaland desde 2022?', respuestas: ['manchester city', 'city'] },
  { pregunta: '⚽ ¿Quién fue el director técnico de Argentina en el Mundial 2022?', respuestas: ['scaloni', 'lionel scaloni'] },
  { pregunta: '⚽ ¿En qué país nació el futbolista Neymar Jr.?', respuestas: ['brasil'] },
  { pregunta: '⚽ ¿Cómo se llama el famoso estadio de Boca Juniors?', respuestas: ['la bombonera', 'bombonera'] },
  { pregunta: '⚽ ¿Qué club europeo ha ganado más Champions League en la historia?', respuestas: ['real madrid', 'madrid'] },
  { pregunta: '⚽ ¿En qué club de Francia jugó Lionel Messi antes de ir al Inter Miami?', respuestas: ['psg', 'paris saint germain', 'paris saint-germain'] },
  { pregunta: '⚽ ¿Cómo se llama la jugada donde se pasa la pelota por entre las piernas del rival?', respuestas: ['caño', 'tunel'] },
  { pregunta: '⚽ ¿Qué equipo ganó la Champions League en la temporada 2023-2024?', respuestas: ['real madrid', 'madrid'] },
  { pregunta: '🌎 ¿Cuál es el país más extenso de todo el continente americano?', respuestas: ['canada'] },
  { pregunta: '🌎 ¿En qué país se encuentra la famosa ciudad antigua de Petra?', respuestas: ['jordania'] },
  { pregunta: '🌎 ¿Cuál es la capital de Japón?', respuestas: ['tokio'] },
  { pregunta: '🌎 ¿Qué país tiene forma de bota en el continente europeo?', respuestas: ['italia'] },
  { pregunta: '🌎 ¿Cuál es el desierto cálido más grande del mundo?', respuestas: ['sahara', 'desierto del sahara'] },
  { pregunta: '🌎 ¿En qué país se localiza la torre de Pisa?', respuestas: ['italia'] },
  { pregunta: '🌎 ¿Cuál es el monte más alto del mundo?', respuestas: ['everest', 'monte everest'] },
  { pregunta: '🌎 ¿Qué estrecho separa a Europa de África en su punto más cercano?', respuestas: ['estrecho de gibraltar', 'gibraltar'] },
  { pregunta: '🌎 ¿Cuál es la capital de Australia, aunque muchos piensen que es Sídney o Melbourne?', respuestas: ['canberra'] },
  { pregunta: '🌎 ¿En qué país se encuentra el famoso Taj Mahal?', respuestas: ['india'] }
];

const TIEMPO_TRIVIA = 30 * 1000;

async function iniciarTrivia(canal) {
  const est = estadoDe(canal);
  const banco = await bancoActivo();

  if (est.trivia) {
    decir(canal, '⚠️ ¡Ya hay una trivia activa en el chat! Respondan rápido catSmash');
    return;
  }

  let disponibles = banco.filter((q) => !est.usadas.includes(q.pregunta));
  if (!disponibles.length) {
    est.usadas = [];
    disponibles = banco;
  }
  const p = disponibles[Math.floor(Math.random() * disponibles.length)];
  est.usadas.push(p.pregunta);
  const trivia = {
    patrones: p.respuestas.map(
      (r) => new RegExp(`(?<![a-z0-9])${escapeRegex(normalizar(r))}(?![a-z0-9])`)
    ),
    correcta: p.respuestas[0],
    timer: null
  };

  trivia.timer = setTimeout(() => {
    if (est.trivia === trivia) {
      est.trivia = null;
      decir(canal, `⏰ ¡Se acabó el tiempo! Nadie la adivinó. La respuesta correcta era: ${trivia.correcta.toUpperCase()} catDespair`);
    }
  }, TIEMPO_TRIVIA);

  est.trivia = trivia;
  decir(canal, `🧠 [TRIVIA]: ${p.pregunta} ⏱️ ¡Tienen 30 segundos!`);
}

function revisarRespuesta(canal, textoNorm, usuario) {
  const est = estadoDe(canal);
  if (!est.trivia) return false;

  if (est.trivia.patrones.some((p) => p.test(textoNorm))) {
    clearTimeout(est.trivia.timer);
    est.trivia = null;
    decir(canal, `¡Correcto @${usuario}! Acertaste la respuesta dancer`);
    return true;
  }
  return false;
}

// ==========================================
// NOTICIAS DE FÚTBOL
// ==========================================
async function buscarNoticiaFutbol(query) {
  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=es-419&gl=AR&ceid=AR:es-419`;
    const xml = await pedirTexto(url);
    const match = xml.match(/<item>[\s\S]*?<title>([\s\S]*?)<\/title>/);
    if (!match) return null;

    let titular = match[1]
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/&amp;/g, '&')
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim();

    const partes = titular.split(' - ');
    if (partes.length > 1) {
      partes.pop();
      titular = partes.join(' - ');
    }

    return titular.length > 90 ? titular.substring(0, 87) + '...' : titular;
  } catch (e) {
    console.error('Error RSS:', e.message);
    return null;
  }
}

const COMANDOS_FUTBOL = {
  '!cr7': {
    query: 'Cristiano Ronaldo',
    formato: (u, t) => `🐐 @${u} [CR7]: ${t} 🇵🇹`,
    fallback: 'El Bicho sigue indetenible rompiendo redes. ¡SIUUU!'
  },
  '!mbappe': {
    query: 'Kylian Mbappe',
    formato: (u, t) => `⚡ @${u} [Mbappé]: ${t} 🇫🇷`,
    fallback: 'La Tortuga volando a máxima velocidad en Europa.'
  },
  '!noticias': {
    query: 'Cristiano Ronaldo Kylian Mbappe',
    formato: (u, t) => `⚽ [Noticia]: ${t}`,
    fallback: 'El Bicho y Mbappé dando de qué hablar en las canchas.'
  }
};

// ==========================================
// CLIMA
// ==========================================
const PALABRAS_IGNORADAS = new Set([
  'kyli', 's2kyli', 's2kylian', 'cuantos', 'cuanto', 'grados', 'hacen', 'hace', 'hay',
  'en', 'el', 'la', 'los', 'las', 'de', 'del', 'clima', 'temperatura', 'tiempo',
  'como', 'esta', 'que', 'hoy', 'ahora', 'por', 'favor', 'me', 'decis', 'dices', 'podes', 'puedes'
]);

const esParaKyli = (t) => /(^|[^a-z0-9])@?(s2kylian|s2kyli|kyli)([^a-z0-9]|$)/.test(t);
const pideClima = (t) => /\b(grados|clima|temperatura)\b/.test(t) || /\btiempo (en|hace)\b/.test(t);

function extraerLugar(texto) {
  const palabras = texto
    .replace(/[@?¿!¡,.]/g, ' ')
    .split(/\s+/)
    .filter((p) => p && !PALABRAS_IGNORADAS.has(normalizar(p)));
  return palabras.join(' ').slice(0, 40).trim() || 'Mendoza';
}

async function responderClima(canal, usuario, texto) {
  const lugar = extraerLugar(texto);
  try {
    const raw = await pedirTexto(`https://wttr.in/${encodeURIComponent(lugar)}?format=j1`);
    const actual = JSON.parse(raw).current_condition[0];
    decir(canal, `🌤️ @${usuario}, en ${lugar.toUpperCase()} hacen ${actual.temp_C}°C (sensación térmica de ${actual.FeelsLikeC}°C).`);
  } catch (e) {
    decir(canal, `No pude encontrar el clima para "${lugar}" @${usuario} catDespair`);
  }
}

// ==========================================
// SALUDOS
// ==========================================
const usuariosSaludados = new Map();
const COOLDOWN_SALUDO = 3 * 60 * 60 * 1000;

setInterval(() => {
  const limite = Date.now() - COOLDOWN_SALUDO;
  for (const [u, t] of usuariosSaludados) if (t < limite) usuariosSaludados.delete(u);
}, 60 * 60 * 1000);

const esSaludoPuro = (t) =>
  /^hola+\b/.test(t) || /^ola+\b/.test(t) ||
  ['oli', 'olis', 'ola unu', 'hola :3', ':3', 'unu'].includes(t);

const RESPUESTAS_SALUDO = (u) => [
  `¡Holaaaa @${u} ! dancer`,
  `¡Holi @${u}! :3`,
  `¡Holaa @${u}, un gusto verte por acá unu`,
  `¡Olis @${u}! ❤️`,
  `¡Hola @${u}! :3 ¿todo bien?`,
  `¡Holiwis @${u}! unu`
];

// ==========================================
// DETECTOR DE MENSAJES
// ==========================================
client.on('message', async (target, context, message, self) => {
  try {
    if (self) return;

    const usernameLower = context.username.toLowerCase();
    if (BOTS_IGNORADOS.has(usernameLower) || context['message-type'] === 'whisper') return;

    const text = message.toLowerCase().trim();
    const textoNorm = normalizar(text);
    const usuario = context['display-name'] || context.username;
    const est = estadoDe(target);

    console.log(`[CHAT] (${target}) ${usuario}: ${text}`);

    if (usernameLower === 's2yone' && text.includes('chau bb')) {
      decir(target, `@${usuario} adios, buenas noches eres lo mejor tkm (eso deberia decirte @vladsuo)`);
      return;
    }

    if (revisarRespuesta(target, textoNorm, usuario)) return;

    if (text === '!trivia') {
      await iniciarTrivia(target);
      return;
    }

    if (text === '!duelos') {
      for (const linea of await mensajeTopDuelos(target)) await decir(target, linea);
      return;
    }

    // COMANDO DUELO DIRECTO EN EL CHAT
    if (text === '!duelo' || text.startsWith('!duelo ')) {
      if (est.dueloActivo) return;
      est.dueloActivo = true;

      try {
        const user = usuario;
        const partes = message.trim().split(/\s+/);
        let touser = partes[1] ? limpiar(partes[1]) : 'un rival misterioso';
        if (!touser || touser.includes('$')) touser = 'un rival misterioso';

        const ganador = Math.random() < 0.5 ? user : touser;

        await decir(target, `${user} ha retado a ${touser} a un duelo a muerte con cuchillos catSmash`);
        await esperar(5000);
        await decir(target, 'La pelea está reñida pero ambos saben que solo puede haber un ganador. catDespair');
        await esperar(5000);
        await decir(target, 'Se muerden, rasguñan y se pican los ojos el uno al otro catSlap ... creo que murió uno de ellos..');
        await esperar(5000);
        await decir(target, `GANADOR: ${ganador} dancer`);

        const perdedor = ganador === user ? touser : user;
        const g = ganador.replace('@', '').toLowerCase();
        const p = perdedor.replace('@', '').toLowerCase();
        if (g !== p && nombreValido(g) && nombreValido(p)) {
          await registrarDuelo(target, g, p);
        }
      } catch (e) {
        console.error('Error en ejecución del duelo directo:', e);
      } finally {
        est.dueloActivo = false;
      }
      return;
    }

    if (esParaKyli(textoNorm) && pideClima(textoNorm)) {
      responderClima(target, usuario, text);
      return;
    }


    const cmdFutbol = COMANDOS_FUTBOL[textoNorm];
    if (cmdFutbol) {
      const titular = await buscarNoticiaFutbol(cmdFutbol.query);
      decir(target, cmdFutbol.formato(usuario, titular || cmdFutbol.fallback));
      return;
    }

    const canalMinus = target.toLowerCase();
    const saludoCorto = esSaludoPuro(text) && text.split(' ').length <= 2 && !text.includes('@');

    if (canalMinus === '#vladsuo' && usernameLower === 's2yone' && saludoCorto) {
      const ahora = Date.now();
      const clave = `${canalMinus}:${usernameLower}`;
      const ultimo = usuariosSaludados.get(clave) || 0;
      if (ahora - ultimo >= COOLDOWN_SALUDO) {
        usuariosSaludados.set(clave, ahora);
        decir(target, `Hola @${usuario} dancer solo te saludo a tí porque los demás me tratan mal unu`);
      }
      return;
    }

    if (canalMinus === '#s2yone' && saludoCorto) {
      const ahora = Date.now();
      const clave = `${canalMinus}:${usernameLower}`;
      const ultimo = usuariosSaludados.get(clave) || 0;
      if (ahora - ultimo >= COOLDOWN_SALUDO) {
        usuariosSaludados.set(clave, ahora);
        const opciones = RESPUESTAS_SALUDO(usuario);
        decir(target, opciones[Math.floor(Math.random() * opciones.length)]);
      }
    }

    if (text === 'dancer') decir(target, 'dancer dancer');

    if (text.startsWith('!lechazo') && text.includes('vladsuo')) {
      decir(target, 'Te voy a acusar con la jefecita');
    }

    if (target === '#vladsuo' && usernameLower === 'vladsuo' && text.startsWith('!garche')) {
      const opciones = [
        '@vladsuo eh :3 ',
        '@vladsuo? ayoCR7 ',
        '@vladsuo BOEE ',
        '@vladsuo GatoCuliao',
        '@vladsuo así te quería atrapar GatoCuliao'
      ];
      decir(target, opciones[Math.floor(Math.random() * opciones.length)]);
    }
  } catch (e) {
    console.error('Error en el handler de mensajes:', e);
  }
});

// ==========================================
// RAIDS
// ==========================================
client.on('raided', async (canal, raider, viewers) => {
  try {
    console.log(`[RAID] ${raider} -> ${canal} (${viewers} viewers)`);

    await decir(canal, `¡Gracias por el raid @${raider}! Bienvenidos todos dancer`);

    if (CLIENT_ID) {
      try {
        await hacerShoutout(canal, raider);
      } catch (e) {
        console.error('No se pudo hacer el shoutout oficial:', e.message);
      }
    }
  } catch (e) {
    console.error('Error en el handler de raids:', e);
  }
});

// ==========================================
// SERVIDOR HTTP
// ==========================================
const app = express();

const VERSION = 'v15-2026-11-03';

app.get('/', (req, res) => {
  res.status(200).send('S2kyli Bot está activo 24/7 🚀');
});

app.get('/version', (req, res) => {
  res.status(200).send(`S2kyli Bot ${VERSION}`);
});

function validarPeticion(req, res, next) {
  const recibida = String(req.query.key || '').trim();
  if (!API_KEY || recibida !== API_KEY) {
    console.warn(`[API] 403 en ${req.path}: la key recibida tiene ${recibida.length} caracteres y la esperada ${API_KEY.length}`);
    return res.sendStatus(403);
  }

  const canal = String(req.query.channel || 's2yone').toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (!CANALES.includes(canal)) {
    console.warn(`[API] 400 en ${req.path}: canal no permitido, llegó ${JSON.stringify(req.query.channel)}`);
    return res.sendStatus(400);
  }

  req.canalNombre = canal;
  req.canal = `#${canal}`;
  next();
}

// ---------- ENDPOINT DUELO ----------
app.get('/duelo', validarPeticion, async (req, res) => {
  const canal = req.canal;
  const est = estadoDe(canal);

  if (est.dueloActivo) {
    return res.send(' ');
  }
  
  est.dueloActivo = true;
  res.send(' ');

  try {
    const user = limpiar(req.query.user) || 'Alguien';
    let touser = limpiar(req.query.touser);
    if (!touser || touser.includes('$')) touser = 'un rival misterioso';

    const ganador = Math.random() < 0.5 ? user : touser;

    await decir(canal, `${user} ha retado a ${touser} a un duelo a muerte con cuchillos catSmash`);
    await esperar(5000);
    await decir(canal, 'La pelea está reñida pero ambos saben que solo puede haber un ganador. catDespair');
    await esperar(5000);
    await decir(canal, 'Se muerden, rasguñan y se pican los ojos el uno al otro catSlap');
    await esperar(5000);
    await decir(canal, `GANADOR: ${ganador} dancer`);

    const perdedor = ganador === user ? touser : user;
    const g = ganador.replace('@', '').toLowerCase();
    const p = perdedor.replace('@', '').toLowerCase();
    if (g !== p && nombreValido(g) && nombreValido(p)) {
      await registrarDuelo(canal, g, p);
    }
  } catch (e) {
    console.error('Error en ejecución del duelo:', e);
  } finally {
    est.dueloActivo = false;
  }
});

// ---------- AMOR ----------
app.get('/amor', validarPeticion, async (req, res) => {
  res.send(' ');

  const canal = req.canal;
  const user = limpiar(req.query.user) || 'Alguien';
  let touser = limpiar(req.query.touser);
  if (!touser || touser.includes('$')) touser = 'alguien';

  const u = user.replace('@', '').toLowerCase();
  const t = touser.replace('@', '').toLowerCase();

  if (req.canalNombre === 's2yone' && (u === 's2yone' || t === 's2yone')) {
    decir(canal, 'Le voy a decir a mi papá');
  } else if (t === 'vladsuo') {
    decir(canal, 'No voy a medir eso, ese hombre tiene dueño, intenta con otro catDespair');
  } else {
    const porcentaje = Math.floor(Math.random() * 101);
    await decir(canal, `Calculando el amor entre ${user} y ${touser}... ❤️`);
    await esperar(3000);
    decir(canal, `La compatibilidad de amor entre ${user} y ${touser} es del ${porcentaje}% BearHug`);
  }
});

// ==========================================
// PANEL DE PREGUNTAS DE TRIVIA (/admin)
// ==========================================
app.set('trust proxy', 1);
app.use(express.json({ limit: '100kb' }));

const fallosAdmin = new Map();

function validarAdmin(req, res, next) {
  if (!ADMIN_PASSWORD) return res.status(503).json({ error: 'Falta ADMIN_PASSWORD en Render' });

  const reg = fallosAdmin.get(req.ip);
  if (reg && reg.n >= 10 && Date.now() < reg.hasta) {
    return res.status(429).json({ error: 'Demasiados intentos, esperá 15 minutos' });
  }

  const dada = Buffer.from(String(req.get('x-admin-key') || ''));
  const real = Buffer.from(ADMIN_PASSWORD);
  if (dada.length !== real.length || !crypto.timingSafeEqual(dada, real)) {
    const vigente = reg && Date.now() < reg.hasta ? reg.n : 0;
    fallosAdmin.set(req.ip, { n: vigente + 1, hasta: Date.now() + 15 * 60 * 1000 });
    return res.status(401).json({ error: 'Contraseña incorrecta' });
  }

  fallosAdmin.delete(req.ip);
  next();
}

const conError = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (e) {
    console.error('Error en /admin:', e.message);
    res.status(500).json({ error: 'No se pudo completar la operación' });
  }
};

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'), (err) => {
    if (err) res.status(404).send('Falta el archivo admin.html en el repositorio.');
  });
});

app.get('/admin/preguntas', validarAdmin, conError(async (req, res) => {
  res.json({ preguntas: await leerPreguntas(), persistente: usaRedis });
}));

app.post('/admin/preguntas', validarAdmin, conError(async (req, res) => {
  const { validas, errores } = parsearLineas(req.body && req.body.lineas);
  await agregarPreguntas(validas);
  res.json({ agregadas: validas.length, errores });
}));

app.delete('/admin/preguntas/:id', validarAdmin, conError(async (req, res) => {
  await borrarPregunta(req.params.id);
  res.json({ ok: true });
}));

app.delete('/admin/preguntas', validarAdmin, conError(async (req, res) => {
  await borrarTodasLasPreguntas();
  res.json({ ok: true });
}));

app.post('/admin/importar', validarAdmin, conError(async (req, res) => {
  const existentes = new Set((await leerPreguntas()).map((q) => q.pregunta));
  const nuevas = BANCO.filter((q) => !existentes.has(q.pregunta));
  await agregarPreguntas(nuevas);
  res.json({ agregadas: nuevas.length, errores: [] });
}));

app.listen(PORT, () => console.log(`Servidor escuchando en el puerto ${PORT} (${VERSION})`));
