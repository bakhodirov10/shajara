require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDB } = require('./db');

const authRoutes = require('./routes/auth');
const shajaraRoutes = require('./routes/shajara');
const exploreRoutes = require('./routes/explore');
const uploadRoutes = require('./routes/upload');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

// API Marshrutlar
app.use('/api/auth', authRoutes);
app.use('/api/shajara', shajaraRoutes);
app.use('/api/explore', exploreRoutes);
app.use('/api/upload', uploadRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    system: 'Shajara.uz - 7 Avlod Milliy Tizimi',
    timestamp: new Date().toISOString()
  });
});

// SPA fallback: Barcha boshqa so'rovlar index.html ga yo'naltiriladi
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serverni ishga tushirish
async function startServer() {
  try {
    await initDB();
    app.listen(PORT, () => {
      console.log(`=======================================================`);
      console.log(`  🌳 Shajara.uz - 7 Avlod Milliy Tizimi Serveri`);
      console.log(`  🚀 Sayt manzili: http://localhost:${PORT}`);
      console.log(`=======================================================`);
    });
  } catch (err) {
    console.error('Serverni ishga tushirishda xatolik:', err);
    process.exit(1);
  }
}

startServer();
