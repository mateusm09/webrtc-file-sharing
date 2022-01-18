const http = require("http");
const { Server } = require("socket.io");
const { v4 } = require("uuid");

const app = http.createServer((req, res) => {
	res.setHeader("Access-Control-Allow-Origin", "*");
	res.setHeader("Access-Control-Request-Method", "*");
	res.setHeader("Access-Control-Allow-Methods", "OPTIONS, GET");
	res.setHeader("Access-Control-Allow-Headers", "*");

	if (req.method === "OPTIONS") {
		res.writeHead(200);
		res.end();
		return;
	}
});

const io = new Server(app, {
	cors: {
		origin: "*",
	},
});
app.listen(3000);

let id = 0;

const clients = {};

io.sockets.on("connection", socket => {
	socket.id = id++;
	socket.emit("id", socket.id);

	socket.on("join", data => {
		if (socket in clients) {
			console.log(`${socket.id} is already in the room`);

			return;
		}

		socket.join(data.room);

		socket.room = data.room;
		console.log(`${socket.id} joined`, data);

		for (const id in clients) {
			const client = clients[id];

			if (client) {
				client.emit("newPeer", {
					id: socket.id,
				});

				socket.emit("newPeer", {
					sendOffer: true,
					id,
				});
			}
		}

		// if (Object.keys(clients).length !== 0) {
		// 	socket.emit("newPeer", {
		// 		sendOffer: true,
		// 		id: socket.id,
		// 	});
		// }

		clients[socket.id] = socket;
	});

	socket.on("offer", data => {
		console.log(`${data.offer.type} from ${socket.id}`);

		const client = clients[data.target];
		if (client) client.emit("offer/response", data);
	});

	socket.on("ice", data => {
		console.log(`ice from ${socket.id}`);

		const client = clients[data.target];
		if (client) client.emit("ice/response", data);
	});

	socket.on("answer", data => {
		io.in(socket.room).emit("answer", data);
	});

	socket.on("disconnect", () => {
		console.log(`${socket.id} disconnected`);

		delete clients[socket.id];
		io.in(socket.room).emit("peerDisconnection", { id: socket.id });
	});
});
