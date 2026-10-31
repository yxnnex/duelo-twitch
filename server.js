Aquí tienes tu archivo completo con la función del clima integrada exactamente como la pediste, sin tocar nada de lo demás:

```javascript
const express = require('express');
const tmi = require('tmi.js');

const app = express();

const USERNAME = 's2kyli';
const OAUTH_TOKEN = 'oauth:6utee3wnxw971ag860bw2xuqpkto1i';

// Mantenemos la conexión abierta a los dos canales donde vas a usarlo
const client = new tmi.Client({
  options: { debug: false },
  identity: {
    username: USERNAME,
    password: OAUTH_TOKEN
  },
  channels: [ 's2yone', 'vladsuo' ]
});

client.connect().catch(console.error);

// Memoria para guardar la última vez que se saludó a cada usuario (Cooldown de 3 horas)
const usuariosSaludados = new Map();
const COOLDOWN_TIEMPO = 3 * 60 * 60 * 1000; // 3 horas en milisegundos

// ==========================================
// DETECTOR DE SALUDOS Y PALABRAS EN EL CHAT
// ==========================================
client.on('message', (target, context, message, self) => {
  if (self) return;

  // Ignoramos los mensajes de Nightbot o whispers
  if (context.username === 'nightbot' || context['message-type'] === 'whisper') return;

  const text = message.toLowerCase().trim();
  const usuario = context['display-name'] || context.username;

  // ==========================================
  // DETECTOR DE CONSULTA DE CLIMA
  // ==========================================
  const esParaKyli = text.includes('kyli') || text.includes('s2kyli');
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

    fetch(`https://wttr.in/${encodeURIComponent(lugar)}?format=j1`)
      .then(res => res.json())
      .then(data => {
        const condicion = data.current_condition[0];
        const tempC = condicion.temp_C;
        const sensacion = condicion.FeelsLikeC;

        client.say(target, `🌤️ @${usuario}, en ${lugar.toUpperCase()} hacen ${tempC}°C (sensación térmica de ${sensacion}°C).`);
      })
      .catch(err => {
        console.error(err);
        client.say(target, `No pude encontrar el clima para "${lugar}" @${usuario} catDespair`);
      });
      
    return;
  }

  // Detecta cuando alguien saluda (hola, ola, holis, olis, :3, unu, etc.)
  if (/^hola+\b/.test(text) || /^ola+\b/.test(text) || text === 'oli' || text === 'olis' || text === 'ola unu' || text === 'hola :3' || text === ':3' || text === 'unu') {
    
    // Si el mensaje tiene espacios largos o nombra a alguien, es una charla entre users y no nos metemos
    const palabras = text.split(' ');
    if (palabras.length > 2 || text.includes('@')) {
      return;
    }

    const ahora = Date.now();
    const ultimoSaludo = usuariosSaludados.get(usuario) || 0;

    // Si todavía no pasaron 3 horas desde su último saludo, el bot lo ignora por completo
    if (ahora - ultimoSaludo < COOLDOWN_TIEMPO) {
      return;
    }

    // Guardamos el momento exacto de este saludo
    usuariosSaludados.set(usuario, ahora);

    // Lista de respuestas variadas que el bot dirá al azar
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

  // Si alguien escribe "dancer", el bot responde "dancer dancer"
  if (text === 'dancer') {
    client.say(target, 'dancer dancer');
  }

  // Si alguien escribe !lechazo dirigido a vladsuo
  if (text.startsWith('!lechazo') && text.includes('vladsuo')) {
    client.say(target, 'Te voy a acusar con la jefecita');
  }

  // Si VladSuo escribe !garche en su propio canal
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

  // Mensaje 1 (Inmediato)
  client.say(channel, `${user} ha retado a ${touser} a un duelo a muerte con cuchillos catSmash `);

  // Mensaje 2 (A los 5 segundos)
  setTimeout(() => {
    client.say(channel, `La Pelea esta reñida pero ambos saben que solo haber un solo ganador. catDespair`);
  }, 5000);

  // Mensaje 3 (A los 10 segundos)
  setTimeout(() => {
    client.say(channel, `Se muerden, rasgunan y se pican los ojos el uno al otro catSlap `);
  }, 10000);

  // Mensaje 4: Ganador (A los 15 segundos)
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

  // Mapeamos los nombres sin el '@' y en minúsculas para comparar bien
  const cleanedUser = user.replace('@', '').toLowerCase();
  const cleanedTouser = touser.replace('@', '').toLowerCase();

  // Regla 1: Si están en el canal s2yone y aparece s2yone en el cálculo de amor
  if (targetChannel === 's2yone' && (cleanedUser === 's2yone' || cleanedTouser === 's2yone')) {
    client.say(channel, `Le voy a decir a mi papá`);
  } 
  // Regla 2: Si etiquetan a vladsuo en cualquier canal
  else if (cleanedTouser === 'vladsuo') {
    client.say(channel, `No voy a medir eso, ese hombre tiene dueño, intenta con otro catDespair`);
  } 
  // Regla 3: Comportamiento normal para cualquier otro caso
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

```
