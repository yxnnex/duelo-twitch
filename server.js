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
// FUNCIÓN PARA BUSCAR NOTICIAS REALES (RSS GOOGLE NEWS)
// ==========================================
function buscarNoticiaFutbol(query, callback) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=es&gl=AR&ceid=AR:es`;

  https.get(url, (res) => {
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
            .replace(/&quot;/g, '"');
          
          titular = titular.split(' - ')[0];
          callback(titular);
        } else {
          callback(null);
        }
      } catch (e) {
        callback(null);
      }
    });
  }).on('error', () => {
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
  // DETECTOR DE CONSULTA DE CLIMA
  // ==========================================
  const esParaKyli = text.includes('kyli');
  const pideClima = text.includes('grados') || text.includes('clima') || text.includes('temperatura') || text.includes('tiempo');

  if (esParaKyli && pideClima) {
    let lugar = text
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

  // Respuesta picante para MESSI
  if (text.includes('messi')) {
    client.say(target, `@${usuario} ve a google, no soy tu pinche scooby doo para averiguarte todo`);
    return;
  }

  // Comandos / menciones de Cristiano Ronaldo (CR7) - Noticias reales
  if (text === '!cr7' || text.includes('cristiano') || text.includes('cr7')) {
    buscarNoticiaFutbol('Cristiano Ronaldo futbol', (titular) => {
      if (titular) {
        client.say(target, `🐐 **[CR7 en vivo]**: ${titular} 🇵🇹`);
      } else {
        client.say(target, `🐐 **[CR7]**: No encontré noticias recientes en este segundo, ¡pero el Bicho sigue intacto! 🇵🇹`);
      }
    });
    return;
  }

  // Comandos / menciones de Kylian Mbappé - Noticias reales
  if (text === '!mbappe' || text.includes('mbappe') || text.includes('mbappé')) {
    buscarNoticiaFutbol('Kylian Mbappe futbol', (titular) => {
      if (titular) {
        client.say(target, `⚡ **[Mbappé en vivo]**: ${titular} 🇫🇷`);
      } else {
        client.say(target, `⚡ **[Mbappé]**: Sin noticias nuevas ahora mismo, pero la tortuga sigue a mil por hora. 🇫🇷`);
      }
    });
    return;
  }

  // Comando general de Noticias de Fútbol
  if (text === '!noticias' || (esParaKyli && text.includes('noticia'))) {
    buscarNoticiaFutbol('Cristiano Ronaldo Kylian Mbappe', (titular) => {
      if (titular) {
        client.say(target, `⚽ **[Noticia en vivo]**: ${titular}`);
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
