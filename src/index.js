import express from 'express';
import 'dotenv/config';
import http from 'http';
import { Server } from 'socket.io';
const app = express();
const PORT = process.env.PORT || 3000;
import axios from 'axios';
const server = http.createServer(app);
const userSocketMap = {};
const getAllConnectedClients = (roomId) => {
  return Array.from(io.sockets.adapter.rooms.get(roomId) || []).map(
    (socketId) => {
      return {
        socketId,
        username: userSocketMap[socketId],
      };
    }
  );
};
// Compile code
const compileCode = async (code, input, language) => {
  try {
    const response = await axios.post(
      'https://judge0-ce.p.rapidapi.com/submissions?base64_encoded=false&fields=*',
      {
        source_code: code,
        stdin: input || '',
        language_id: language || 52,
      },
      {
        headers: {
          'x-rapidapi-key':
            '1a423ea865msh941cb7fd16a8585p16283cjsn7d72ed21c8a4',
          'x-rapidapi-host': 'judge0-ce.p.rapidapi.com',
          'Content-Type': 'application/json',
        },
      }
    );

    const submissionId = response.data.token;
    // console.log('Submission token:', submissionId);

    // Poll for the result
    let result;
    do {
      await new Promise((res) => setTimeout(res, 2000)); // Wait 2 seconds
      const resultResponse = await axios.get(
        `https://judge0-ce.p.rapidapi.com/submissions/${submissionId}?base64_encoded=false&fields=*`,
        {
          headers: {
            'x-rapidapi-key':
              '1a423ea865msh941cb7fd16a8585p16283cjsn7d72ed21c8a4',
            'x-rapidapi-host': 'judge0-ce.p.rapidapi.com',
          },
        }
      );
      result = resultResponse.data;
    } while (result.status.id < 3); // 3 means completed
    return result;
    // console.log('Compilation result:', result.stdout || result.stderr);
  } catch (error) {
    console.error('Error during submission:', error.message);
  }
};
const io = new Server(server);
io.on('connection', (socket) => {
  console.log('a user connected', socket.id);
  // listen for Join a room
  socket.on('join', ({ roomId, username }) => {
    userSocketMap[socket.id] = username;
    socket.join(roomId);
    const clients = getAllConnectedClients(roomId);
    clients.forEach(({ socketId }) => {
      io.to(socketId).emit('joined', {
        clients,
        username,
        socketId: socket.id,
      });
    });
    // Listen for disconnecting
    socket.on('disconnecting', () => {
      const clients = getAllConnectedClients(roomId);
      clients.forEach(({ socketId }) => {
        io.to(socketId).emit('disconnected', {
          username: userSocketMap[socket.id],
          socketId: socket.id,
        });
      });
      socket.leave(roomId);
      delete userSocketMap[socket.id];
    });

    // Listen for code changes
    socket.on('code-change', async ({ roomId, code }) => {
      try {
        const clients = getAllConnectedClients(roomId);
        clients.forEach(({ socketId }) => {
          if (socketId !== socket.id) {
            io.to(socketId).emit('code-change', {
              code,
            });
          }
        });
      } catch (error) {
        console.error(`Compilation failed: ${error.message}`);
      }
    });
    //  when a new user joins code sync
    socket.on('code-sync', ({ socketId, code }) => {
      io.to(socketId).emit('code-change', {
        code,
      });
    });
    // Listen for code submission
    socket.on('submit', async ({ roomId, code, language, input }) => {
      try {
        const Id = {
          javascript: 63,
          cpp: 52,
          python: 71,
          java: 62,
        };

        const result = await compileCode(code, input, Id[language]);
        const output = result.stdout || result.stderr || 'No output';

        // Emit the compilation result to all users in the room
        const clients = getAllConnectedClients(roomId);
        clients.forEach(({ socketId }) => {
          io.to(socketId).emit('submission-result', {
            output,
          });
        });
      } catch (error) {
        console.error(`Compilation failed: ${error.message}`);
        const clients = getAllConnectedClients(roomId);
        clients.forEach(({ socketId }) => {
          io.to(socketId).emit('submission-error', {
            error: error.message,
          });
        });
      }
    });
    // Listen for input synchronization
    socket.on('input-sync', ({ roomId, input }) => {
      const clients = getAllConnectedClients(roomId);
      clients.forEach(({ socketId }) => {
        if (socketId !== socket.id) {
          io.to(socketId).emit('input-sync', { input });
        }
      });
    });

    // Listen for output synchronization
    socket.on('output-sync', ({ roomId, output }) => {
      const clients = getAllConnectedClients(roomId);
      clients.forEach(({ socketId }) => {
        if (socketId !== socket.id) {
          io.to(socketId).emit('output-sync', { output });
        }
      });
    });

    // new format for code change it includes the sender
    // socket.on('code-change', ({ roomId, code }) => {
    //   io.from(roomId).emit('code-change', {
    //     code,
    //   });
    // });
  });
});

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
