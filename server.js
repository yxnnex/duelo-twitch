const express = require('express');
const https = require('https');
const tmi = require('tmi.js');

const app = express();

const USERNAME = 's2kyli';
// Utiliza una variable de entorno para mayor seguridad (configura TWITCH_OAUTH en tu panel de Render)
const OAUTH_TOKEN = process.env.TWITCH_OAUTH || 'oauth:6utee3wnxw971ag860bw2xuqpkto1i';

// Conexión a los canales permitidos
const CANALES = ['s2yone', 'vladsuo'];
const client = new tmi.Client({
  options: { debug: false },
  identity: {
    username: USERNAME,
    password: OAUTH_TOKEN
  },
  channels: CANALES
});

client.connect().catch(console.error);

// Memoria de cooldown para saludos en s2yone
const usuariosSaludados = new Map();
const COOLDOWN_TIEMPO = 3 * 60 * 60 * 1000;

// Estados independientes por canal para bardo y trivias
const estadosCanales = {};
function obtenerEstadoCanal(canal) {
  if (!estadosCanales[canal]) {
    estadosCanales[canal] = {
      estadoElian: 0,
      estadoTomada: 0,
      triviaActiva: false,
      respuestasValidasActuales: [],
      temporizadorTrivia: null,
      preguntasUsadas: []
    };
  }
  return estadosCanales[canal];
}

const bancoPreguntas = [
  // --- LEAGUE OF LEGENDS ---
  { pregunta: '🎮 ¿Cuál es el nombre del hermano de Yone?', respuestas: ['yasuo'] },
  { pregunta: '🎮 ¿Quién es el hermano o hermana menor de Garen?', respuestas: ['lux'] },
  { pregunta: '🎮 ¿Quién creó al campeón Blitzcrank?', respuestas: ['viktor'] },
  { pregunta: '🎮 ¿Cómo se llama el osito de peluche que lleva Annie a la batalla?', respuestas: ['tibbers'] },
  { pregunta: '🎮 ¿Cómo se llama el arco legendario que utiliza Ashe?', respuestas: ['avarosa', 'arco de avarosa'] },
  { pregunta: '🎮 ¿Qué clase o rol de campeón es Poppy según su kit?', respuestas: ['tanque'] },
  { pregunta: '🎮 ¿Qué campeón usa un farol y es conocido por atrapar almas?', respuestas: ['thresh'] },
  { pregunta: '🎮 ¿A los cuántos minutos aparece por primera vez el Barón Nashor en la partida?', respuestas: ['20', 'minuto 20'] },
  { pregunta: '🎮 ¿Cuál es el nombre del campeón dragón creador de estrellas en el LoL?', respuestas: ['aurelion sol', 'aurelion'] },
  { pregunta: '🎮 ¿Cómo se llama el reino o ciudad flotante y futurista de Runaterra (contraparte de Zaun)?', respuestas: ['piltover'] },
  { pregunta: '🎮 ¿Cómo se llama la habilidad definitiva (R) de Yone?', respuestas: ['sello del destino', 'sello de destino'] },
  { pregunta: '🎮 ¿Qué campeón de LoL es un demonio del miedo y usa guadaña?', respuestas: ['fiddlesticks'] },
  { pregunta: '🎮 ¿Cómo se llama el mapa clásico donde se juegan las partidas 5v5 tradicionales de LoL?', respuestas: ['grieta del invocador', 'la grieta del invocador', 'grieta'] },
  { pregunta: '🎮 ¿Qué campeón tirador (ADC) tiene como arma un cañón de mano llamado Susurro?', respuestas: ['jhin'] },
  { pregunta: '🎮 ¿Cómo se llama el monstruo neutral que aparece en el foso antes del Barón Nashor?', respuestas: ['heraldo', 'heraldo de la grieta', 'larva', 'vacuo'] },
  // --- FÚTBOL ---
  { pregunta: '⚽ ¿Cuántos Balones de Oro ganó Cristiano Ronaldo?', respuestas: ['5', 'cinco'] },
  { pregunta: '⚽ ¿Qué selección ganó la Copa del Mundo Qatar 2022?', respuestas: ['argentina', 'la scaloneta', 'albiceleste'] },
  { pregunta: '⚽ ¿En qué club europeo debutó profesionalmente Cristiano Ronaldo?', respuestas: ['sporting de lisboa', 'sporting', 'lisboa'] },
  { pregunta: '⚽ ¿En qué equipo juega actualmente Kylian Mbappé?', respuestas: ['real madrid', 'madrid'] },
  { pregunta: '⚽ ¿Qué país ganó la Eurocopa 2024?', respuestas: ['espana', 'españa'] },
  { pregunta: '⚽ ¿Cuál es el clásico rival del Real Madrid en España?', respuestas: ['barcelona', 'barsa', 'barca'] },
  { pregunta: '⚽ ¿En qué estadio juega de local la Selección Argentina?', respuestas: ['monumental', 'mas monumental', 'el monumental'] },
  { pregunta: '⚽ ¿Qué dorsal (número de camiseta) caracteriza históricamente a Cristiano Ronaldo?', respuestas: ['7', 'siete'] },
  { pregunta: '⚽ ¿Qué apodo recibe Kylian Mbappé por su velocidad en la cancha?', respuestas: ['tortuga', 'donatello'] },
  { pregunta: '⚽ ¿Qué selección ganó la Copa América 2021 jugada en Brasil?', respuestas: ['argentina', 'la scaloneta', 'albiceleste'] },
  { pregunta: '⚽ ¿En qué club de la Premier League inglesa juega actualmente Erling Haaland?', respuestas: ['manchester city', 'city'] },
  { pregunta: '⚽ ¿Quién fue el director técnico de la Selección Argentina en la Copa del Mundo 2022?', respuestas: ['scaloni', 'lionel scaloni'] },
  { pregunta: '⚽ ¿En qué país nació el futbolista Neymar Jr.?', respuestas: ['brasil'] },
  { pregunta: '⚽ ¿Cómo se llama el famoso estadio de Boca Juniors?', respuestas: ['la bombonera', 'bombonera'] },
  { pregunta: '⚽ ¿Qué club europeo ha ganado más títulos de UEFA Champions League en la historia?', respuestas: ['real madrid', 'madrid'] },
  { pregunta: '⚽ ¿En qué club de Francia jugó Lionel Messi antes de ir al Inter Miami?', respuestas: ['psg', 'paris saint germain', 'paris saint-germain'] },
  { pregunta: '⚽ ¿Cómo se llama la jugada de fútbol donde un jugador pasa la pelota por entre las piernas del rival?', respuestas: ['cano', 'caño', 'tunel'] },
  { pregunta: '⚽ ¿Qué equipo ganó la Champions League en la temporada 2023-2024?', respuestas: ['real madrid', 'madrid'] },
  // --- GEOGRAFÍA ---
  { pregunta: '🌎 ¿Cuál es el país más extenso de todo el continente americano?', respuestas: ['canada'] },
  { pregunta: '🌎 ¿En qué país se encuentra la famosa ciudad antigua de Petra?', respuestas: ['jordania'] },
  { pregunta: '🌎 ¿Cuál es la capital de Japón?', respuestas: ['tokio'] },
  { pregunta: '🌎 ¿Qué país tiene forma de bota en el continente europeo?', respuestas: ['italia'] },
  { pregunta: '🌎 ¿Cuál es el desierto cálido más grande del mundo?', respuestas: ['sahara', 'desierto del sahara'] },
  { pregunta: '🌎 ¿En qué país se localiza la torre de Pisa?', respuestas: ['italia'] },
  { pregunta: '🌎 ¿Cuál es el monte más alto del mundo ubicado en la cordillera del Himalaya?', respuestas: ['everest', 'monte everest'] },
  { pregunta: '🌎 ¿Qué estrecho separa al continente europeo del africano en su punto más cercano?', respuestas: ['estrecho de gibraltar', 'gibraltar'] },
  { pregunta: '🌎 ¿Cuál es la capital de Australia, aunque muchos piensen que es Sídney o Melbourne?', respuestas: ['canberra'] },
  { pregunta: '🌎 ¿En qué país se encuentra el famoso monumento de el Taj Mahal?', respuestas: ['india'] }
];

// Función para buscar noticias de fútbol con timeout seguro
function buscarNoticiaFutbol(query, callback) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=es-419&gl=AR&ceid=AR:es-419`;
  const options = {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    timeout: 5000
  };

  const req = https.get(url, options, (res) => {
    let xmlData = '';
    res.on('data', (chunk) => { xmlData += chunk; });
    res.on('end', () => {
      try {
        const match = xmlData.match(/<item>[\s\S]*?<title>([\s\S]*?)<\/title>/);
        if (match && match[1]) {
          let titular = match[1]
            .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
            .replace(/&amp;/g, '&')
            .replace(/&#39;/g, "'")
            .replace(/&quot;/g, '"')
            .trim();
          
          const partes = titular.split(' - ');
          if (partes.length > 1) {
            partes.pop();
            titular = partes.join(' - ');
          }
          if (titular.length > 90) titular = titular.substring(0, 87) + '...';
          callback(titular);
        } else {
          callback(null);
        }
      } catch (e) {
        callback(null);
      }
    });
  });

  req.on('error', () => callback(null));
  req.on('timeout', () => {
    req.destroy();
    callback(null);
  });
}

// Normalizador para trivias sin tildes
const normalizar = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

client.on('message', (target, context, message, self) => {
  if (self) return;

  const usernameLower = context.username.toLowerCase();
  if (usernameLower === 'streamelements' || usernameLower === 'nightbot' || context['message-type'] === 'whisper') return;

  const text = message.toLowerCase().trim();
  const usuario = context['display-name'] || context.username;
  const canalState = obtenerEstadoCanal(target);

  console.log(`[CHAT] (${target}) ${usuario}: ${text}`);

  // 1. REGLA ESPECIAL PARA S2YONE
  if (usernameLower === 's2yone' && text.includes('chau bb')) {
    client.say(target, `@${usuario} adios, buenas noches eres lo mejor tkm (eso deberia decirte @vladsuo)`);
    return;
  }

  // 2. LÓGICA ELIANHDC
  if (usernameLower === 'elianhdc') {
    if (canalState.estadoElian === 1) {
      canalState.estadoElian = 2; 
      client.say(target, `@${usuario} vos empezaste`);
      return;
    }
    if (canalState.estadoElian === 0) {
      canalState.estadoElian = 1; 
      client.say(target, `Uuh este p..`);
      return;
    }
    return;
  }

  // 3. LÓGICA TOMADAA
  if (usernameLower === 'tomadaa') {
    if (canalState.estadoTomada === 1) {
      canalState.estadoTomada = 2;
      client.say(target, `@${usuario} vos empezaste`);
      return;
    }
    if (canalState.estadoTomada === 0) {
      canalState.estadoTomada = 1;
      client.say(target, `Uuh llego el hijo de puta`);
      return;
    }
    return;
  }

  // 4. SISTEMA DE TRIVIA DINÁMICA
  if (canalState.triviaActiva) {
    const textNorm = normalizar(text);
    const acerto = canalState.respuestasValidasActuales.some(resp => {
      const respNorm = normalizar(resp);
      return new RegExp(`(^|\\s)${respNorm}($|\\s|[.!?,])`).test(textNorm);
    });

    if (acerto) {
      canalState.triviaActiva = false;
      clearTimeout(canalState.temporizadorTrivia);
      client.say(target, `¡Correcto @${usuario}! Acertaste la respuesta dancer`);
      return;
    }
  }

  if (text === '!trivia') {
    if (canalState.triviaActiva) {
      client.say(target, `⚠️ ¡Ya hay una trivia activa en el chat! Respondan rápido catSmash`);
      return;
    }

    if (canalState.preguntasUsadas.length >= bancoPreguntas.length) {
      canalState.preguntasUsadas = [];
    }

    let disponibles = bancoPreguntas.filter((_, index) => !canalState.preguntasUsadas.includes(index));
    let indiceAleatorio = Math.floor(Math.random() * disponibles.length);
    let preguntaObj = disponibles[indiceAleatorio];
    
    let indiceOriginal = bancoPreguntas.indexOf(preguntaObj);
    canalState.preguntasUsadas.push(indiceOriginal);

    canalState.respuestasValidasActuales = Array.isArray(preguntaObj.respuestas) ? preguntaObj.respuestas : [preguntaObj.respuestas];
    canalState.triviaActiva = true;

    client.say(target, `🧠 [TRIVIA]: ${preguntaObj.pregunta} ⏱️ ¡Tienen 30 segundos!`);

    canalState.temporizadorTrivia = setTimeout(() => {
      if (canalState.triviaActiva) {
        canalState.triviaActiva = false;
        client.say(target, `¡Se acabó el tiempo! Nadie la adivinó. La respuesta correcta era: **${canalState.respuestasValidasActuales[0].toUpperCase()}** catDespair`);
      }
    }, 30000);

    return;
  }

  // DETECTOR DE CONSULTA DE CLIMA SEGURO (Filtrando palabras vacías exactas)
  const esParaKyli = text.includes('kyli') || text.includes('s2kyli') || text.includes('s2kylian');
  const pideClima = text.includes('grados') || text.includes('clima') || text.includes('temperatura') || (text.includes('tiempo') && text.includes('hace'));

  if (esParaKyli && pideClima) {
    const ignorar = new Set(['kyli','s2kyli','s2kylian','cuantos','cuanto','grados','hacen','hace','en','el','la','clima','temperatura','tiempo','de','que']);
    let lugar = text.replace(/[?@]/g, '').split(/\s+/).filter(p => !ignorar.has(p)).join(' ').trim();
    if (!lugar) lugar = 'Mendoza';

    const urlClima = `https://wttr.in/${encodeURIComponent(lugar)}?format=j1`;
    const reqClima = https.get(urlClima, { timeout: 5000 }, (resClima) => {
      let datos = '';
      resClima.on('data', (chunk) => { datos += chunk; });
      resClima.on('end', () => {
        try {
          const data = JSON.parse(datos);
          const condicion = data.current_condition[0];
          client.say(target, `🌤️ @${usuario}, en ${lugar.toUpperCase()} hacen ${condicion.temp_C}°C (sensación térmica de ${condicion.FeelsLikeC}°C).`);
        } catch (e) {
          client.say(target, `No pude procesar el clima para "${lugar}" @${usuario} catDespair`);
        }
      });
    });

    reqClima.on('error', () => client.say(target, `No pude encontrar el clima para "${lugar}" @${usuario} catDespair`));
    reqClima.on('timeout', () => {
      reqClima.destroy();
      client.say(target, `El servicio de clima tardó mucho en responder @${usuario} catDespair`);
    });

    return;
  }

  // COMANDOS DE FÚTBOL
  if (text === '!messi' || text.startsWith('messi ') || text === 'messi') {
    client.say(target, `@${usuario} ve a google, no soy tu pinche scooby doo para averiguarte todo`);
    return;
  }

  if (text === '!cr7') {
    buscarNoticiaFutbol('Cristiano Ronaldo', (titular) => {
      if (titular) client.say(target, `🐐 @${usuario} [CR7]: ${titular} 🇵🇹`);
      else client.say(target, `🐐 @${usuario} [CR7]: El Bicho sigue indetenible rompiendo redes. ¡SIUUU! 🇵🇹`);
    });
    return;
  }

  if (text === '!mbappe' || text === '!mbappé') {
    buscarNoticiaFutbol('Kylian Mbappe', (titular) => {
      if (titular) client.say(target, `⚡ @${usuario} [Mbappé]: ${titular} 🇫🇷`);
      else client.say(target, `⚡ @${usuario} [Mbappé]: La Tortuga volando a máxima velocidad en Europa. 🇫🇷`);
    });
    return;
  }

  if (text === '!noticias') {
    buscarNoticiaFutbol('Cristiano Ronaldo Kylian Mbappe', (titular) => {
      if (titular) client.say(target, `⚽ [Noticia]: ${titular}`);
      else client.say(target, `⚽ [Noticias]: El Bicho y Mbappé dando de qué hablar en las canchas.`);
    });
    return;
  }

  // DETECTOR DE SALUDOS (Solo en #s2yone)
  const esSaludoPuro = /^hola+\b/.test(text) || /^ola+\b/.test(text) || text === 'oli' || text === 'olis' || text === 'ola unu' || text === 'hola :3' || text === ':3' || text === 'unu';

  if (esSaludoPuro && target.toLowerCase() === '#s2yone') {
    const palabras = text.split(' ');
    if (palabras.length > 2 || text.includes('@')) return;

    const ahora = Date.now();
    const ultimoSaludo = usuariosSaludados.get(usernameLower) || 0;

    if (ahora - ultimoSaludo < COOLDOWN_TIEMPO) return;
    usuariosSaludados.set(usernameLower, ahora);

    const respuestasBot = [
      `¡Holaaaa @${usuario} ! dancer`,
      `¡Holi @${usuario}! :3`,
      `¡Holaa @${usuario}, un gusto verte por acá unu`,
      `¡Olis @${usuario}! ❤️`,
      `¡Hola @${usuario}! :3 ¿todo bien?`,
      `¡Holiwis @${usuario}! unu`
    ];
    client.say(target, respuestasBot[Math.floor(Math.random() * respuestasBot.length)]);
  }

  if (text === 'dancer') client.say(target, 'dancer dancer');
  if (text.startsWith('!lechazo') && text.includes('vladsuo')) client.say(target, 'Te voy a acusar con la jefecita');

  if (target === '#vladsuo' && usernameLower === 'vladsuo' && text.startsWith('!garche')) {
    const respuestasGarche = ['@vladsuo eh :3 ', '@vladsuo? ayoCR7 ', '@vladsuo BOEE ', '@vladsuo GatoCuliao', '@vladsuo así te quería atrapar GatoCuliao'];
    client.say(target, respuestasGarche[Math.floor(Math.random() * respuestasGarche.length)]);
  }
});

// ENDPOINTS WEB SEGUROS
app.get('/', (req, res) => {
  res.status(200).send('S2kyli Bot está activo 24/7 🚀');
});

app.get('/duelo', (req, res) => {
  if (req.query.key !== process.env.API_KEY) return res.status(403).send('Acceso no autorizado');

  const user = req.query.user || 'Alguien';
  let touser = req.query.touser;
  if (!touser || touser.trim() === '' || touser === '$(touser)' || touser === '$(query)') touser = 'un rival misterioso';
  
  const targetChannel = req.query.channel ? req.query.channel.toLowerCase() : 's2yone';
  const channel = `#${targetChannel}`;
  if (!CANALES.includes(targetChannel)) return res.status(400).send('Canal no válido');

  const peleadores = [user, touser];
  const ganador = peleadores[Math.floor(Math.random() * peleadores.length)];

  client.say(channel, `${user} ha retado a ${touser} a un duelo a muerte con cuchillos catSmash`);
  setTimeout(() => client.say(channel, `La pelea está reñida pero ambos saben que solo habrá un solo ganador. catDespair`), 5000);
  setTimeout(() => client.say(channel, `Se muerden, rasguñan y se pican los ojos el uno al otro catSlap`), 10000);
  setTimeout(() => client.say(channel, `GANADOR: ${ganador} dancer`), 15000);

  res.send(' ');
});

app.get('/amor', (req, res) => {
  if (req.query.key !== process.env.API_KEY) return res.status(403).send('Acceso no autorizado');

  const user = req.query.user || 'Alguien';
  const touser = req.query.touser || 'alguien';
  const targetChannel = req.query.channel ? req.query.channel.toLowerCase() : 's2yone';
  const channel = `#${targetChannel}`;
  if (!CANALES.includes(targetChannel)) return res.status(400).send('Canal no válido');

  const cleanedUser = user.replace('@', '').toLowerCase();
  const cleanedTouser = touser.replace('@', '').toLowerCase();

  if (targetChannel === 's2yone' && (cleanedUser === 's2yone' || cleanedTouser === 's2yone')) {
    client.say(channel, `Le voy a decir a mi papá`);
  } else if (cleanedTouser === 'vladsuo') {
    client.say(channel, `No voy a medir eso, ese hombre tiene dueño, intenta con otro catDespair`);
  } else {
    const porcentaje = Math.floor(Math.random() * 101);
    client.say(channel, `Calculando el amor entre ${user} y ${touser}... ❤️`);
    setTimeout(() => client.say(channel, `La compatibilidad de amor entre ${user} y ${touser} es del ${porcentaje}% BearHug`), 3000);
  }

  res.send(' ');
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Servidor escuchando en el puerto ${PORT}`));
