const express = require('express');
const tmi = require('tmi.js');

const app = express();

// CONFIGURACIÓN
const USERNAME = 's2yone';
const OAUTH_TOKEN = 'oauth:19qzc73gb84s71f6lzl7cad82va82r';
const CHANNEL_NAME = 's2yone';

// Conexión al chat de Twitch
const client = new tmi.Client({
  options: { debug: false },
  identity: {
    username: USERNAME,
    password: OAUTH_TOKEN
  },
  channels: [ CHANNEL_NAME ]
});

client.connect().catch(console.error);

app.get('/duelo', (req, res) => {
  const user = req.query.user || 'Alguien';
  const touser = req.query.touser || 'un rival';

  // Elegir ganador al azar (50% / 50%)
  const peleadores = [user, touser];
  const ganador = peleadores[Math.floor(Math.random() * peleadores.length)];

  // Mensaje 1 (Inmediato)
  client.say(CHANNEL_NAME, `${user} ha retado a ${touser} a un duelo a muerte con cuchillos doroChaos.`);

  // Mensaje 2 (3.5 segundos después)
  setTimeout(() => {
    client.say(CHANNEL_NAME, `La pelea está reñida pero ambos saben que solo puede haber un solo ganador. doroDevil`);
  }, 3500);

  // Mensaje 3 (7 segundos después)
  setTimeout(() => {
    client.say(CHANNEL_NAME, `Se muerden, rasguñan y se pican los ojos el uno al otro doroKnife.`);
  }, 7000);

  // Mensaje 4: Ganador (10.5 segundos después)
  setTimeout(() => {
    client.say(CHANNEL_NAME, `GANADOR: ${ganador} doroBuffme`);
  }, 10500);

  // Le respondemos a Nightbot con un texto vacío para que no tire error ni duplique
  res.send(' ');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor escuchando en el puerto ${PORT}`));