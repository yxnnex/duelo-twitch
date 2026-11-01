const express = require('express');
const tmi = require('tmi.js');

// ==========================================
// CONFIGURACIÓN (todo lo sensible va por variables de entorno)
// ==========================================
const USERNAME = process.env.TWITCH_USERNAME || 's2kyli';
const OAUTH_TOKEN = process.env.TWITCH_OAUTH;      // ej: oauth:xxxxxxxx
const API_KEY = process.env.API_KEY;               // clave para /duelo y /amor
const PORT = process.env.PORT || 10000;
const CANALES = ['s2yone', 'vladsuo'];

if (!OAUTH_TOKEN) {
  console.error('❌ Falta la variable de entorno TWITCH_OAUTH');
  process.exit(1);
}
if (!API_KEY) {
  console.warn('⚠️ Falta API_KEY: los endpoints /duelo y /amor van a rechazar todas las peticiones.');
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

// Evita que un parámetro externo inyecte comandos de Twitch (/ban, .timeout, etc.)
const limpiar = (s, max = 30) =>
  String(s || '').replace(/^[\s/.\\]+/, '').slice(0, max).trim();

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
// ESTADO POR CANAL (nada se comparte entre s2yone y vladsuo)
// ==========================================
const estados = new Map();

function estadoDe(canal) {
  if (!estados.has(canal)) {
    estados.set(canal, {
      trivia: null,            // trivia activa en este canal
      usadas: [],              // preguntas ya usadas en este canal
      advertidos: new Map(),   // usuario -> 1 (advertido) | 2 (ignorado)
      dueloActivo: false
    });
  }
  return estados.get(canal);
}

// ==========================================
// BANCO DE TRIVIA
// (las respuestas se comparan sin tildes y como palabra completa)
// ==========================================
const BANCO = [
  // --- LEAGUE OF LEGENDS ---
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

  // --- FÚTBOL ---
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

  // --- GEOGRAFÍA ---
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

function iniciarTrivia(canal) {
  const est = estadoDe(canal);

  if (est.trivia) {
    decir(canal, '⚠️ ¡Ya hay una trivia activa en el chat! Respondan rápido catSmash');
    return;
  }

  if (est.usadas.length >= BANCO.length) est.usadas = [];

  const disponibles = BANCO.map((_, i) => i).filter((i) => !est.usadas.includes(i));
  const idx = disponibles[Math.floor(Math.random() * disponibles.length)];
  est.usadas.push(idx);

  const p = BANCO[idx];
  const trivia = {
    // coincide solo con palabras completas (así "15" no acierta un "5")
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
// NOTICIAS DE FÚTBOL (Google News RSS)
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

    // Google News agrega " - Nombre del medio" al final
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
// CLIMA (wttr.in)
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
// USUARIOS CON FLUJO ESPECIAL (advertencia -> ignorado), POR CANAL
// ==========================================
const USUARIOS_ADVERTIDOS = {
  elianhdc: { aviso: 'Uuh este p..' },
  tomadaa: { aviso: 'Uuh llego el hijo de puta' }
};

// ==========================================
// SALUDOS (solo en #s2yone) CON COOLDOWN
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

    // 1. Regla especial para s2yone ("chau bb")
    if (usernameLower === 's2yone' && text.includes('chau bb')) {
      decir(target, `@${usuario} adios, buenas noches eres lo mejor tkm (eso deberia decirte @vladsuo)`);
      return;
    }

    // 2. Flujo especial: 1er mensaje = aviso, 2do = "vos empezaste", después se ignora (por canal)
    if (USUARIOS_ADVERTIDOS[usernameLower]) {
      const nivel = est.advertidos.get(usernameLower) || 0;
      if (nivel === 0) {
        est.advertidos.set(usernameLower, 1);
        decir(target, USUARIOS_ADVERTIDOS[usernameLower].aviso);
      } else if (nivel === 1) {
        est.advertidos.set(usernameLower, 2);
        decir(target, `@${usuario} vos empezaste`);
      }
      return;
    }

    // 3. Trivia: ¿acertó alguien? (solo cuenta en ESTE canal)
    if (revisarRespuesta(target, textoNorm, usuario)) return;

    if (text === '!trivia') {
      iniciarTrivia(target);
      return;
    }

    // 4. Clima
    if (esParaKyli(textoNorm) && pideClima(textoNorm)) {
      responderClima(target, usuario, text);
      return;
    }

    // 5. Comandos de fútbol
    if (text === '!messi' || text.startsWith('messi ')) {
      decir(target, `@${usuario} ve a google, no soy tu pinche scooby doo para averiguarte todo`);
      return;
    }

    const cmdFutbol = COMANDOS_FUTBOL[textoNorm];
    if (cmdFutbol) {
      const titular = await buscarNoticiaFutbol(cmdFutbol.query);
      decir(target, cmdFutbol.formato(usuario, titular || cmdFutbol.fallback));
      return;
    }

    // 6. Saludos
    const canalMinus = target.toLowerCase();
    const saludoCorto = esSaludoPuro(text) && text.split(' ').length <= 2 && !text.includes('@');

    // 6a. Mensaje especial: s2yone saluda en el canal de vladsuo
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

    // 6b. Saludos normales (solo en #s2yone)
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

    // 7. Extras
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
// SERVIDOR HTTP (UptimeRobot + comandos de Nightbot/StreamElements)
// ==========================================
const app = express();

app.get('/', (req, res) => {
  res.status(200).send('S2kyli Bot está activo 24/7 🚀');
});

// Middleware: exige API_KEY y un canal permitido
function validarPeticion(req, res, next) {
  if (!API_KEY || req.query.key !== API_KEY) return res.sendStatus(403);

  const canal = String(req.query.channel || 's2yone').toLowerCase().replace('#', '');
  if (!CANALES.includes(canal)) return res.sendStatus(400);

  req.canalNombre = canal;       // sin #
  req.canal = `#${canal}`;       // con #
  next();
}

// ---------- DUELO ----------
app.get('/duelo', validarPeticion, async (req, res) => {
  const canal = req.canal;
  const est = estadoDe(canal);

  // Respondemos YA para que Nightbot no se quede esperando 15 segundos
  res.send(' ');

  if (est.dueloActivo) return; // evita duelos solapados
  est.dueloActivo = true;

  try {
    const user = limpiar(req.query.user) || 'Alguien';
    let touser = limpiar(req.query.touser);
    if (!touser || touser === '$(touser)' || touser === '$(query)') touser = 'un rival misterioso';

    const ganador = Math.random() < 0.5 ? user : touser;

    await decir(canal, `${user} ha retado a ${touser} a un duelo a muerte con cuchillos catSmash`);
    await esperar(5000);
    await decir(canal, 'La pelea está reñida pero ambos saben que solo puede haber un ganador. catDespair');
    await esperar(5000);
    await decir(canal, 'Se muerden, rasguñan y se pican los ojos el uno al otro catSlap');
    await esperar(5000);
    await decir(canal, `GANADOR: ${ganador} dancer`);
  } finally {
    est.dueloActivo = false;
  }
});

// ---------- AMOR ----------
app.get('/amor', validarPeticion, async (req, res) => {
  res.send(' ');

  const canal = req.canal;
  const user = limpiar(req.query.user) || 'Alguien';
  const touser = limpiar(req.query.touser) || 'alguien';

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

app.listen(PORT, () => console.log(`Servidor escuchando en el puerto ${PORT}`));
