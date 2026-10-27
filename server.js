const express = require('express');
const tmi = require('tmi.js');

const app = express();

const USERNAME = 's2kyli';
const OAUTH_TOKEN = 'oauth:6utee3wnxw971ag860bw2xuqpkto1i';

// Conectamos el bot a ambos canales
const client = new tmi.Client({
  options: { debug: false },
  identity: {
    username: USERNAME,
    password: OAUTH_TOKEN
  },
  channels: [ 's2yone', 'vladsuo' ]
});

client.connect().catch(console.error);

app.get('/duelo', (req, res) => {
  const user = req.query.user || 'Alguien';
  const touser = req.query.touser || 'un rival';
  
  // Detecta el canal al que debe responder (por defecto s2yone)
  const channel = req.query.channel ? `#${req.query.channel}` : '#s2yone';

  const peleadores = [user, touser];
  const ganador = peleadores[Math.floor(Math.random() * peleadores.length)];

  // Mensaje 1 (Inmediato)
  client.say(channel, `${user} ha retado a ${touser} a un duelo a muerte con cuchillos catSmash.`);

  // Mensaje 2 (A los 5 segundos)
  setTimeout(() => {
    client.say(channel, `La Pelea esta reñida pero ambos saben que solo haber un solo ganador. catDespair`);
  }, 5000);

  // Mensaje 3 (A los 10 segundos)
  setTimeout(() => {
    client.say(channel, `Se muerden, rasgunan y se pican los ojos el uno al otro catSlap.`);
  }, 10000);

  // Mensaje 4: Ganador (A los 15 segundos)
  setTimeout(() => {
    client.say(channel, `GANADOR: ${ganador} dancer`);
  }, 15000);

  res.send(' ');
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Servidor escuchando en el puerto ${PORT}`));
