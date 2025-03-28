// server.js - Node.js server to handle the collaborative aspect
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Room management for pairs of users
const rooms = new Map();
const userRooms = new Map();

// Handle socket connections
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);
  
  // Handle room joining
  socket.on('joinRoom', (roomId) => {
    // Leave current room if in one
    leaveCurrentRoom(socket);
    
    // Join the requested room
    if (!rooms.has(roomId)) {
      // Create a new room if it doesn't exist
      rooms.set(roomId, new Set([socket.id]));
    } else {
      // Add user to existing room if there's space
      const room = rooms.get(roomId);
      if (room.size < 2) {
        room.add(socket.id);
      } else {
        // Room is full, notify the user
        socket.emit('roomFull');
        return;
      }
    }
    
    // Associate user with room
    userRooms.set(socket.id, roomId);
    socket.join(roomId);
    
    // Notify user they've joined the room
    socket.emit('roomJoined', roomId);
    
    // Notify all users in the room about the current participants
    io.to(roomId).emit('roomUpdate', {
      participants: rooms.get(roomId).size
    });
    
    console.log(`User ${socket.id} joined room ${roomId}`);
  });
  
  // Handle MIDI messages
  socket.on('midi', (message) => {
    const roomId = userRooms.get(socket.id);
    if (roomId) {
      // Forward the MIDI message to all other users in the room
      socket.to(roomId).emit('midi', message);
    }
  });
  
  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    leaveCurrentRoom(socket);
  });
  
  // Handle explicit room leaving
  socket.on('leaveRoom', () => {
    leaveCurrentRoom(socket);
  });
  
  // Helper function to handle a user leaving their current room
  function leaveCurrentRoom(socket) {
    const roomId = userRooms.get(socket.id);
    if (roomId) {
      // Remove user from room
      const room = rooms.get(roomId);
      room.delete(socket.id);
      
      // Clean up empty rooms
      if (room.size === 0) {
        rooms.delete(roomId);
      } else {
        // Notify remaining users about the update
        io.to(roomId).emit('roomUpdate', {
          participants: room.size
        });
      }
      
      // Remove user-room association
      userRooms.delete(socket.id);
      socket.leave(roomId);
      
      console.log(`User ${socket.id} left room ${roomId}`);
    }
  }
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});