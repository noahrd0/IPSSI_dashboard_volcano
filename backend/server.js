require('dotenv').config();
const express = require('express');
const expressWs = require('express-ws');
const cors = require('cors');
const mongoose = require('mongoose');
const app = express();
expressWs(app);

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/volcano_monitoring';

// Middleware
app.use(cors());
app.use(express.json());

// Connexion MongoDB
mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ Connecté à MongoDB'))
  .catch(err => console.error('❌ Erreur de connexion MongoDB:', err));

// Routes
const volcanRoutes = require('./routes/volcans');
const seismeRoutes = require('./routes/seismes');
const thermiqueRoutes = require('./routes/thermique');
const etatRoutes = require('./routes/etats');
const websocketRoutes = require('./routes/websocket');
const syncRoutes = require('./routes/sync');

app.use('/api/volcans', volcanRoutes);
app.use('/api/seismes', seismeRoutes);
app.use('/api/thermique', thermiqueRoutes);
app.use('/api/etats', etatRoutes);
app.use('/api/sync', syncRoutes);
app.use('/ws', websocketRoutes);

// Route de santé
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🚀 Serveur backend démarré sur le port ${PORT}`);
});
