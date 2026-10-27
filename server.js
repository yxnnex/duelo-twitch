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

// ==========================================
// DETECTOR DE SALUDOS Y PALABRAS EN EL CHAT
// ==========================================
client.on('message', (target, context, message, self) => {
  if (self) return;

  const text = message.toLowerCase().trim();

  // Detecta saludos comunes y variaciones alargadas como "holaaaaaa"
  if (/^hola+$/.test(text) || text === 'ola' || text === 'holi' || text === 'holis') {
    const usuario = context['display-name'] || context.username;
    client.say(target, `¡Holaaaa @${usuario}, qué tal! dancer`);
  }

  // Si alguien escribe "dancer", el bot responde "dancer dancer"
  if (text === 'dancer') {
    client.say(target, 'dancer dancer');
  }

  // Si alguien escribe !lechazo dirigido a vladsuo
  if (text.startsWith('!lechazo') && text.includes('vladsuo')) {
    client.say(target, 'Te voy a acusar con la jefecita');
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
