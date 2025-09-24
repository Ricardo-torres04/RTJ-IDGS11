const supabase = require('./db');

module.exports = (io) => {
  // Middleware para autenticación
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Autenticación requerida'));
    }
    
    try {
      // Verificar token con Supabase o tu método de autenticación
      // Ejemplo simplificado:
      const { data: usuario } = await supabase
        .from('usuarios')
        .select('id, rol_id, usuario')
        .eq('id', token)
        .single();
      
      if (!usuario) {
        return next(new Error('Usuario no autorizado'));
      }
      
      // Guardar información del usuario en el objeto socket
      socket.usuario = usuario;
      next();
    } catch (error) {
      next(new Error('Error de autenticación'));
    }
  });

  io.on('connection', (socket) => {
    console.log('Usuario conectado:', socket.id, socket.usuario?.usuario);
    
    // Actualizar estado del delivery a 'working' cuando se conecta
    if (socket.usuario && socket.usuario.rol_id === 2) { // rol_id 2 = delivery
      updateDeliveryStatus(socket.usuario.id, 'working');
    }
    
    // Recibir actualizaciones de ubicación (cada 10 segundos)
    socket.on('location-update', async (data) => {
      // Verificar que sea un delivery
      if (socket.usuario && socket.usuario.rol_id === 2) {
        try {
          // Guardar ubicación en la base de datos
          await saveLocationToDatabase(socket.usuario.id, data.lat, data.lng);
          
          // Emitir a todos los admins
          io.to('admin-room').emit('location-broadcast', {
            deliveryId: socket.usuario.id,
            usuario: socket.usuario.usuario,
            lat: data.lat,
            lng: data.lng,
            timestamp: new Date()
          });
        } catch (error) {
          console.error('Error al guardar ubicación:', error);
        }
      }
    });
    
    // Actualización de estado de paquete
    socket.on('package-status-update', async (data) => {
      try {
        // Actualizar estado del paquete en la base de datos
        const { data: updatedPackage, error } = await supabase
          .from('paquetes')
          .update({ status_id: data.statusId })
          .eq('id', data.packageId)
          .eq('delivery_id', socket.usuario.id) // Verificar que el paquete pertenezca a este delivery
          .select();
          
        if (error) throw error;
        
        // Notificar a los admins sobre el cambio de estado
        io.to('admin-room').emit('package-status-changed', updatedPackage);
        
        // Confirmar al delivery que se actualizó correctamente
        socket.emit('package-status-updated', { success: true, package: updatedPackage });
      } catch (error) {
        console.error('Error al actualizar estado del paquete:', error);
        socket.emit('package-status-updated', { success: false, error: error.message });
      }
    });
    
    // Unir a salas según rol
    if (socket.usuario) {
      if (socket.usuario.rol_id === 1) { // Admin
        socket.join('admin-room');
      } else if (socket.usuario.rol_id === 2) { // Delivery
        socket.join('delivery-room');
      }
    }
    
    socket.on('disconnect', () => {
      console.log('Usuario desconectado:', socket.id, socket.usuario?.usuario);
      
      // Actualizar estado del delivery a 'off' cuando se desconecta
      if (socket.usuario && socket.usuario.rol_id === 2) {
        updateDeliveryStatus(socket.usuario.id, 'off');
      }
    });
  });
  
  // Función para guardar ubicación en la base de datos
  async function saveLocationToDatabase(deliveryId, lat, lng) {
    const { error } = await supabase
      .from('ubicaciones_delivery')
      .insert({
        delivery_id: deliveryId,
        ubicacion: `POINT(${lng} ${lat})` // Formato: longitud, latitud
      });
      
    if (error) throw error;
  }
  
  // Función para actualizar el estado del delivery
  async function updateDeliveryStatus(deliveryId, status) {
    const { error } = await supabase
      .from('usuarios')
      .update({ status })
      .eq('id', deliveryId);
      
    if (error) console.error('Error al actualizar estado del delivery:', error);
  }
};