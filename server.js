const express = require('express');
const https = require('https');
const tmi = require('tmi.js');

const app = express();

const USERNAME = 's2kyli';
const OAUTH_TOKEN = 'oauth:6utee3wnxw971ag860bw2xuqpkto1i';

// Conexión a los dos canales
const client = new tmi.Client({
  options: { debug: false },
  identity: {
    username: USERNAME,
    password: OAUTH_TOKEN
  },
  channels: [ 's2yone', 'vladsuo' ]
});

client.connect().catch(console.error);

// Memoria de cooldown (3 horas por usuario para saludos)
const usuariosSaludados = new Map();
const COOLDOWN_TIEMPO = 3 * 60 * 60 * 1000;

// ==========================================
// ESTADO DE LA TRIVIA DINÁMICA
// ==========================================
let triviaActiva = false;
let respuestaCorrectaActual = '';
let temporizadorTrivia = null;
let preguntasUsadas = [];

const bancoPreguntas = [
  // --- LEAGUE OF LEGENDS ---
  { pregunta: '🎮 ¿Cuál es el nombre del hermano gemelo y principal main de Yone en el LoL?', respuesta: 'yasuo' },
  { pregunta: '🎮 ¿En qué región de Runaterra nació Ahri?', respuesta: 'jonia' },
  { pregunta: '🎮 ¿Cómo se llama la pasiva de Katarina que le reinicia las habilidades al conseguir una baja?', respuesta: 'voracidad' },
  { pregunta: '🎮 ¿Qué campeón usa un farol y es conocido por pescar almas en la jungla?', respuesta: 'thresh' },
  { pregunta: '🎮 ¿Cuál es el nombre de la espada legendaria que usa Master Yi?', respuesta: 'doran' }, // o wuju
  { pregunta: '🎮 ¿Cómo se llama el dragón que otorga velocidad de movimiento fuera de combate?', respuesta: 'dragón de nubes' },
  { pregunta: '🎮 ¿Qué rol cumple habitualmente Ashe en la Grieta del Invocador?', respuesta: 'tirador' },
  { pregunta: '🎮 ¿Cuál es la nacionalidad de Zed en el lore de Jonia?', respuesta: 'jonia' },
  { pregunta: '🎮 ¿Qué objeto otorga invisibilidad activa y daño de letalidad a los asesinos?', respuesta: 'duskblade' },
  { pregunta: '🎮 ¿Cómo se llama el barón épico principal que otorga mejoras de súbditos y daño de ataque?', respuesta: 'barón nashor' },
  { pregunta: '🎮 ¿Qué campeona es la reina del vacío en el LoL?', respuesta: 'kai\'sa' }, // o kaisa o reksai
  { pregunta: '🎮 ¿Cuál es el arma principal de Lux?', respuesta: 'vara lumínica' }, // o báculo

  // --- FÚTBOL ---
  { pregunta: '⚽ ¿Cuántos Balones de Oro ganó Cristiano Ronaldo?', respuesta: '5' },
  { pregunta: '⚽ ¿Qué selección ganó la Copa del Mundo Qatar 2022?', respuesta: 'argentina' },
  { pregunta: '⚽ ¿En qué club europeo debutó profesionalmente Cristiano Ronaldo?', respuesta: 'sporting de lisboa' },
  { pregunta: '⚽ ¿En qué equipo juega actualmente Kylian Mbappé?', r: 'real madrid', respuesta: 'real madrid' },
  { pregunta: '⚽ ¿Cuántos goles oficiales históricos persigue Cristiano Ronaldo en su carrera?', respuesta: '900' },
  { pregunta: '⚽ ¿Qué país ganó la Eurocopa 2024?', respuesta: 'españa' },
  { pregunta: '⚽ ¿Cuál es el clásico rival del Real Madrid en España?', respuesta: 'barcelona' },
  { pregunta: '⚽ ¿En qué estadio juega de local la Selección Argentina?', respuesta: 'mas monumentaf' }, // o monumental
  { pregunta: '⚽ ¿Qué dorsal (número de camiseta) caracteriza históricamente a Cristiano Ronaldo?', respuesta: '7' },
  { pregunta: '⚽ ¿Qué apodo recibe Kylian Mbappé por su increíble velocidad?', respuesta: 'tortuga' },
  { pregunta: '⚽ ¿Qué equipo ganó la Champions League en la temporada 2023-2024?', respuesta: 'real madrid' },
  { pregunta: '⚽ ¿En qué país se disputó la Copa del Mundo de 2014?', respuesta: 'brasil' }
];

// ==========================================
// FUNCIÓN PARA BUSCAR NOTICIAS REALES (RSS GOOGLE NEWS)
// ==========================================
function buscarNoticiaFutbol(query, callback) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=es-419&gl=AR&ceid=AR:es-419`;

  const options = {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  };

  https.get(url, options, (res) => {
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

          callback(titular);
        } else {
          callback(null);
        }
      } catch (e) {
        callback(null);
      }
    });
  }).on('error', (err) => {
    console.error('Error RSS:', err.message);
    callback(null);
  });
}

// ==========================================
// DETECTOR DE MENSAJES Y PALABRAS EN EL CHAT
// ==========================================
client.on('message', (target, context, message, self) => {
  if (self) return;

  if (context.username === 'nightbot' || context['message-type'] === 'whisper') return;

  const text = message.toLowerCase().trim();
  const usuario = context['display-name'] || context.username;

  console.log(`[CHAT] (${target}) ${usuario}: ${text}`);

  // ==========================================
  // 1. SISTEMA DE TRIVIA DINÁMICA CON TEMPORIZADOR
  // ==========================================
  if (triviaActiva) {
    if (text.includes(respuestaCorrectaActual)) {
      triviaActiva = false;
      clearTimeout(temporizadorTrivia); // Cancelamos el cronómetro porque ya ganaron
      client.say(target, `🎉 ¡Correcto @${usuario}! Acertaste la respuesta y ganaste la ronda de trivia 🏆 dancer`);
      return;
    }
  }

  // Comando para lanzar una trivia nueva
  if (text === '!trivia') {
    if (triviaActiva) {
      client.say(target, `⚠️ ¡Ya hay una trivia activa en el chat! Respondan rápido catSmash`);
      return;
    }

    // Si ya se usaron todas, reiniciamos el mazo para que nunca se repita seguido
    if (preguntasUsadas.length >= bancoPreguntas.length) {
      preguntasUsadas = [];
    }

    // Filtrar preguntas no usadas
    let disponibles = bancoPreguntas.filter((_, index) => !preguntasUsadas.includes(index));
    let indiceAleatorio = Math.floor(Math.random() * disponibles.length);
    let preguntaObj = disponibles[indiceAleatorio];
    
    // Guardar como usada
    let indiceOriginal = bancoPreguntas.indexOf(preguntaObj);
    preguntasUsadas.push(indiceOriginal);

    respuestaCorrectaActual = preguntaObj.respuesta.toLowerCase();
    triviaActiva = true;

    client.say(target, `🧠 **[TRIVIA DINÁMICA]**: ${preguntaObj.pregunta} ⏱️ ¡Tienen 30 segundos!`);

    // Temporizador de 30 segundos si nadie responde
    temporizadorTrivia = setTimeout(() => {
      if (triviaActiva) {
        triviaActiva = false;
        client.say(target, `⏳ ¡Se acabó el tiempo! Nadie la adivinó. La respuesta correcta era: **${preguntaObj.respuesta.toUpperCase()}** catDespair`);
      }
    }, 30000);

    return;
  }

  // ==========================================
  // DETECTOR DE CONSULTA DE CLIMA
  // ==========================================
  const esParaKyli = text.includes('kyli') || text.includes('s2kyli') || text.includes('s2kylian');
  const pideClima = text.includes('grados') || text.includes('clima') || text.includes('temperatura') || text.includes('tiempo');

  if (esParaKyli && pideClima) {
    let lugar = text
      .replace(/@?s2kylian/g, '')
      .replace(/@?s2kyli/g, '')
      .replace(/kyli/g, '')
      .replace(/cuantos/g, '')
      .replace(/cuanto/g, '')
      .replace(/grados/g, '')
      .replace(/hacen en/g, '')
      .replace(/hace en/g, '')
      .replace(/hacen/g, '')
      .replace(/hace/g, '')
      .replace(/clima/g, '')
      .replace(/temperatura/g, '')
      .replace(/en/g, '')
      .replace(/el/g, '')
      .replace(/la/g, '')
      .replace(/\?/g, '')
      .trim();

    if (!lugar) lugar = 'Mendoza';

    const urlClima = `https://wttr.in/${encodeURIComponent(lugar)}?format=j1`;

    https.get(urlClima, (resClima) => {
      let datos = '';
      resClima.on('data', (chunk) => { datos += chunk; });
      resClima.on('end', () => {
        try {
          const data = JSON.parse(datos);
          const condicion = data.current_condition[0];
          const tempC = condicion.temp_C;
          const sensacion = condicion.FeelsLikeC;

          client.say(target, `🌤️ @${usuario}, en ${lugar.toUpperCase()} hacen ${tempC}°C (sensación térmica de ${sensacion}°C).`);
        } catch (e) {
          client.say(target, `No pude procesar el clima para "${lugar}" @${usuario} catDespair`);
        }
      });
    }).on('error', (err) => {
      client.say(target, `No pude encontrar el clima para "${lugar}" @${usuario} catDespair`);
    });
      
    return;
  }

  // ==========================================
  // COMANDOS Y NOTICIAS DE FÚTBOL EN TIEMPO REAL
  // ==========================================

  // Respuesta picante para MESSI (Solo comando directo o mención directa)
  if (text === '!messi' || text.startsWith('messi ') || text === 'messi') {
    client.say(target, `@${usuario} ve a google, no soy tu pinche scooby doo para averiguarte todo`);
    return;
  }

  // Comandos / menciones de Cristiano Ronaldo (CR7) - Noticias reales
  if (text === '!cr7' || text.includes('cristiano') || text.includes('cr7')) {
    buscarNoticiaFutbol('Cristiano Ronaldo', (titular) => {
      if (titular) {
        client.say(target, `🐐 @${usuario} **[CR7]**: ${titular} 🇵🇹`);
      } else {
        client.say(target, `🐐 @${usuario} **[CR7]**: El Bicho sigue indetenible rompiendo redes. ¡SIUUU! 🇵🇹`);
      }
    });
    return;
  }

  // Comandos / menciones de Kylian Mbappé - Noticias reales
  if (text === '!mbappe' || text.includes('mbappe') || text.includes('mbappé')) {
    buscarNoticiaFutbol('Kylian Mbappe', (titular) => {
      if (titular) {
        client.say(target, `⚡ @${usuario} **[Mbappé]**: ${titular} 🇫🇷`);
      } else {
        client.say(target, `⚡ @${usuario} **[Mbappé]**: La Tortuga volando a máxima velocidad en Europa. 🇫🇷`);
      }
    });
    return;
  }

  // Comando general de Noticias de Fútbol
  if (text === '!noticias' || (esParaKyli && text.includes('noticia'))) {
    buscarNoticiaFutbol('Cristiano Ronaldo Kylian Mbappe', (titular) => {
      if (titular) {
        client.say(target, `⚽ **[Noticia]**: ${titular}`);
      } else {
        client.say(target, `⚽ **[Noticias]**: El Bicho y Mbappé dando de qué hablar en las canchas.`);
      }
    });
    return;
  }

  // ==========================================
  // DETECTOR DE SALUDOS EN EL CHAT
  // ==========================================
  if (/^hola+\b/.test(text) || /^ola+\b/.test(text) || text === 'oli' || text === 'olis' || text === 'ola unu' || text === 'hola :3' || text === ':3' || text === 'unu') {
    
    const palabras = text.split(' ');
    if (palabras.length > 2 || text.includes('@')) {
      return;
    }

    const ahora = Date.now();
    const ultimoSaludo = usuariosSaludados.get(usuario) || 0;

    if (ahora - ultimoSaludo < COOLDOWN_TIEMPO) {
      return;
    }

    usuariosSaludados.set(usuario, ahora);

    const respuestasBot = [
      `¡Holaaaa @${usuario} ! dancer`,
      `¡Holi @${usuario}! :3`,
      `¡Holaa @${usuario}, un gusto verte por acá unu`,
      `¡Olis @${usuario}! ❤️`,
      `¡Hola @${usuario}! :3 ¿todo bien?`,
      `¡Holiwis @${usuario}! unu`
    ];

    const respuestaElegida = respuestasBot[Math.floor(Math.random() * respuestasBot.length)];
    client.say(target, respuestaElegida);
  }

  if (text === 'dancer') {
    client.say(target, 'dancer dancer');
  }

  if (text.startsWith('!lechazo') && text.includes('vladsuo')) {
    client.say(target, 'Te voy a acusar con la jefecita');
  }

  if (target === '#vladsuo' && context.username.toLowerCase() === 'vladsuo' && text.startsWith('!garche')) {
    const respuestasGarche = [
      '@vladsuo eh :3 ',
      '@vladsuo? ayoCR7 ',
      '@vladsuo BOEE ',
      '@vladsuo ¡Apa la papaaaaa!',
      '@vladsuo y así te quería atrapar GatoCuliao'
    ];
    const respuestaAleatoria = respuestasGarche[Math.floor(Math.random() * respuestasGarche.length)];
    client.say(target, respuestaAleatoria);
  }
});

// ==========================================
// COMANDO 1: DUELO
// ==========================================
app.get('/duelo', (req, res) => {
  const user = req.query.user || 'Alguien';
  let touser = req.query.touser;
  if (!touser || touser.trim() === '' || touser === '$(touser)' || touser === '$(query)') {
    touser = 'un rival misterioso';
  }
  
  const targetChannel = req.query.channel ? req.query.channel.toLowerCase() : 's2yone';
  const channel = `#${targetChannel}`;

  const peleadores = [user, touser];
  const ganador = peleadores[Math.floor(Math.random() * peleadores.length)];

  client.say(channel, `${user} ha retado a ${touser} a un duelo a muerte con cuchillos catSmash `);

  setTimeout(() => {
    client.say(channel, `La Pelea esta reñida pero ambos saben que solo haber un solo ganador. catDespair`);
  }, 5000);

  setTimeout(() => {
    client.say(channel, `Se muerden, rasgunan y se pican los ojos el uno al otro catSlap `);
  }, 10000);

  setTimeout(() => {
    client.say(channel, `GANADOR: ${ganador} dancer `);
  }, 15000);

  res.send(' ');
});

// ==========================================
// COMANDO 2: AMOR (CON REGLAS ESPECIALES)
// ==========================================
app.get('/amor', (req, res) => {
  const user = req.query.user || 'Alguien';
  const touser = req.query.touser || 'alguien';
  
  const targetChannel = req.query.channel ? req.query.channel.toLowerCase() : 's2yone';
  const channel = `#${targetChannel}`;

  const cleanedUser = user.replace('@', '').toLowerCase();
  const cleanedTouser = touser.replace('@', '').toLowerCase();

  if (targetChannel === 's2yone' && (cleanedUser === 's2yone' || cleanedTouser === 's2yone')) {
    client.say(channel, `Le voy a decir a mi papá`);
  } 
  else if (cleanedTouser === 'vladsuo') {
    client.say(channel, `No voy a medir eso, ese hombre tiene dueño, intenta con otro catDespair`);
  } 
  else {
    const porcentaje = Math.floor(Math.random() * 101);
    client.say(channel, `Calculando el amor entre ${user} y ${touser}... ❤️`);
    
    setTimeout(() => {
      client.say(channel, `La compatibilidad de amor entre ${user} y ${touser} es del ${porcentaje}% BearHug `);
    }, 3000);
  }

  res.send(' ');
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Servidor escuchando en el puerto ${PORT}`));
