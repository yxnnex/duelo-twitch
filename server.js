const express = require('express');
const tmi = require('tmi.js');

const app = express();

// CONFIGURACIÓN DE TU CUENTA BOT Y CANAL
const USERNAME = 's2kyli';
const OAUTH_TOKEN = 'oauth:6utee3wnxw971ag860bw2xuqpkto1i';
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

  // Elegir ganador al azar entre los dos
  const peleadores = [user, touser];
  const ganador = peleadores[Math.floor(Math.random() * peleadores.length)];

  // Mensaje 1 (Inmediato)
  client.say(CHANNEL_NAME, `${user} ha retado a ${touser} a un duelo a muerte con cuchillos doroChaos.`);

  // Mensaje 2 (A los 5 segundos)
  setTimeout(() => {
    client.say(CHANNEL_NAME, `La Pelea esta reñida pero ambos saben que solo haber un solo ganador. doroDevil`);
  }, 5000);

  // Mensaje 3 (A los 10 segundos)
  setTimeout(() => {
    client.say(CHANNEL_NAME, `Se muerden, rasgunan y se pican los ojos el uno al otro doroKnife.`);
  }, 10000);

  // Mensaje 4: Ganador (A los 15 segundos)
  setTimeout(() => {
    client.say(CHANNEL_NAME, `GANADOR: ${ganador} doroBuff`);
  }, 15000);

  res.send(' ');
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Servidor escuchando en el puerto ${PORT}`));
