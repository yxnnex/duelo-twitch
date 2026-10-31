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
  // COMANDOS Y NOTICIAS DE FÚTBOL
  // ==========================================

  // Respuesta picante para MESSI
  if (text.includes('messi')) {
    client.say(target, `@${usuario} ve a google, no soy tu pinche scooby doo para averiguarte todo`);
    return;
  }

  // Comandos / menciones de Cristiano Ronaldo (CR7)
  if (text === '!cr7' || text.includes('cristiano') || text.includes('cr7')) {
    const noticiasCR7 = [
      `🐐 **[CR7]**: Cristiano Ronaldo sigue rompiendo récords y sumando goles oficiales en su carrera. ¡SIUUU! 🇵🇹`,
      `⚽ **[CR7]**: Imparable en el área. El Comandante no se cansa de marcar.`,
      `🔥 **[CR7]**: 5 Champions, máximo goleador histórico. Simplemente El Bicho.`
    ];
    const resCR7 = noticiasCR7[Math.floor(Math.random() * noticiasCR7.length)];
    client.say(target, resCR7);
    return;
  }

  // Comandos / menciones de Kylian Mbappé
  if (text === '!mbappe' || text.includes('mbappe') || text.includes('mbappé')) {
    const noticiasMbappe = [
      `⚡ **[Mbappé]**: Velocidad pura y definición letal liderando el ataque en Europa. 🇫🇷`,
      `🐢 **[Mbappé]**: La Tortuga Ninja marcando la diferencia en los partidos decisivos.`,
      `⚽ **[Mbappé]**: Gambeta endiablada y potencia total. ¡Kylian está imparable!`
    ];
    const resMbappe = noticiasMbappe[Math.floor(Math.random() * noticiasMbappe.length)];
    client.say(target, resMbappe);
    return;
  }

  // Comando general de Noticias de Fútbol
  if (text === '!noticias' || (esParaKyli && text.includes('noticia'))) {
    const noticiasMix = [
      `⚽ **[Cristiano Ronaldo]**: El Bicho sigue facturando dobletes y rompiendo marcas históricas. SIUUU!`,
      `⚽ **[Kylian Mbappé]**: Mbappé a máxima velocidad liderando las noches de Champions League.`
    ];
    const noticia = noticiasMix[Math.floor(Math.random() * noticiasMix.length)];
    client.say(target, noticia);
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
