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
// DETECTOR DE SALUDOS AUTOMÁTICO EN EL CHAT
// ==========================================
client.on('message', (target, context, message, self) => {
  if (self) return;

  const text = message.toLowerCase().trim();

  if (text === 'hola' || text === 'ola' || text === 'holi' || text === 'holis') {
    const usuario = context['display-name'] || context.username;
    client.say(target, `¡Holaaaa @${usuario}, qué tal! dancer`);
  }
});

// ==========================================
// COMANDO 1: DUELO
// ==========================================
app.get('/duelo', (req, res) => {
  const user = req.query.user || 'Alguien';
  const touser = req.query.touser || 'un rival';
  
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
// COMANDO 2: AMOR (CON REGLA ESPECIAL PARA VLADSUO)
// ==========================================
app.get('/amor', (req, res) => {
  const user = req.query.user || 'Alguien';
  const touser = req.query.touser || 'alguien';
  
  const targetChannel = req.query.channel ? req.query.channel.toLowerCase() : 's2yone';
  const channel = `#${targetChannel}`;

  // Mapeamos el nombre sin el '@' por si lo escriben con mención
  const cleanedTouser = touser.replace('@', '').toLowerCase();

  // Si etiquetan a vladsuo, responde con el mensaje especial
  if (cleanedTouser === 'vladsuo') {
    client.say(channel, `No voy a medir eso, ese hombre tiene dueño, intenta con otro catDespair`);
  } else {
    // Para cualquier otro usuario, calcula el porcentaje de amor
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
