const socketIO = require('socket.io');
const sockets = {};
let io;


exports.establishSocket = (server) => {
    io = new socketIO.Server(server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        }
    });
    io.of("/iwmsSocket").on("connection", (socket) => {
        const sessionId = socket.handshake.query.sesId;
        sockets[sessionId] = socket;
        socket.on('disconnect', (reason) => {
            delete sockets[sessionId];
        });
    });
};

exports.emitEvent = (sid, name, data) => {
    const socket = sid ? sockets[sid.trim()] : null;
    if (socket && socket.connected) {
        socket.emit(name, data);
    }
};

