const express = require('express');
const router = express.Router();

// Importar rutas específicas
// const userRoutes = require('./user.routes');
// router.use('/users', userRoutes);

// Ruta de ejemplo
router.get('/status', (req, res) => {
  res.json({ status: 'ok', message: 'API funcionando correctamente' });
});

module.exports = router;