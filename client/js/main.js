const socket = io("http://localhost:3000", {
	cors: {
		origin: "*",
	},
});

const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

const clients = {};
let ownId;

const clientsView = document.getElementById("clients");
const messagesView = document.getElementById("messages");

const messageInput = document.getElementById("file");

socket.on("connect", () => {
	console.log("Connected");

	socket.emit("join", {
		room: "teste",
	});
});

socket.on("id", id => {
	ownId = parseInt(id);

	console.log("id", id);
});

// ouve por conexões de novos clientes
socket.on("newPeer", async data => {
	const { id, sendOffer } = data;

	console.log(`new peer ${id}`);
	// clientsView.appendChild(document.createElement("p")).innerHTML = `${id}`;

	// cria um novo peer para representar o vinculo entre este cliente e o conectado
	const peer = new RTCPeerConnection({ iceServers: ICE_SERVERS });
	clients[id] = peer; // adiciona o peer a lista de conexões ativas

	peer.onicecandidate = event => {
		if (event.candidate) {
			socket.emit("ice", {
				id: ownId,
				target: id,
				candidate: event.candidate,
			});
		}
	};

	// espera o ser criado um canal de dados, e pega a sua referência pelo evento
	peer.ondatachannel = event => {
		const channel = event.channel;
		onChannel(channel, id);
	};

	if (sendOffer) {
		// o novo cliente recebe a mensagem dizendo para ele enviar uma oferta de conexão
		// para todos os clientes já conectados
		// é necessário abrir um peer por cliente, assim criando um grafo de conexões
		console.log(`${ownId} will send offer to ${id}`);

		// se ele deve enviar a oferta de conexão, ele deve criar um canal de dados
		// o canal deve ser criado antes de criar a oferta, para o mesmo entrar na descrição
		const channel = peer.createDataChannel("chat");
		onChannel(channel, id);

		const offer = await peer.createOffer();
		await peer.setLocalDescription(offer);

		socket.emit("offer", {
			id: ownId,
			target: id,
			offer,
		});
	}
});

socket.on("offer/response", async data => {
	const { id, offer } = data;
	// if (id == ownId) return;
	console.log(`${offer.type} from ${id}`);

	const peer = clients[id];

	// configura a descrição do peer remoto com a oferta recebida
	// pode ser tanto uma oferta quanto uma resposta
	const desc = new RTCSessionDescription(offer);
	await peer.setRemoteDescription(desc);

	if (offer.type === "offer") {
		// se a descrição recebida for uma oferta,
		// o peer deve responder a requisição
		const answer = await peer.createAnswer();
		await peer.setLocalDescription(answer);
		console.log(`will answer from ${ownId} to ${id}`);

		socket.emit("offer", {
			id: ownId,
			target: id,
			offer: answer,
		});
	}
});

socket.on("ice/response", data => {
	const { id, candidate } = data;

	// if (id == ownId) return;

	console.log(`ice from ${id}`);

	if (candidate) {
		clients[id].addIceCandidate(candidate);
	}
});

socket.on("peerDisconnection", data => {
	const { id } = data;
	console.log(`peer ${id} disconnected`);

	// clientsView.removeChild(clientsView.querySelector(`p:contains(${id})`));
	clients[id].close();
	delete clients[id];
});

function sendFile(event) {
	event.preventDefault();

	const message = messageInput.files[0];
	messageInput.files[0] = null;

	console.log("message", message);

	const { size, chunks, type } = getFileMetadata(message, 1000);
	console.log("metadata", { size, chunks, type });

	broadcast(JSON.stringify({ size, chunks, type, message: "header" }));

	streamFile(message, 1000, (data, chunk, offset) => {
		console.log("READ CHUNK", { data, chunk, offset });

		if (data !== null) {
			broadcast(JSON.stringify({ data: Array.from(new Uint8Array(data)), chunk, message: "chunk" }));
		} else {
			broadcast(JSON.stringify({ message: "eof" }));
		}
	});

	// console.log("will send message", message);

	// for (const id in clients) {
	// 	const client = clients[id];

	// 	client.channel.send(message);
	// }
}

function broadcast(data) {
	for (const id in clients) {
		const client = clients[id];

		client.channel.send(data);
	}
}

let fileArray = [];
let type = "";

function onFileComplete() {
	const image = document.getElementById("image");
	console.log("fileArray", fileArray);
	const blob = new Blob([new Uint8Array(fileArray)], { type });
	console.log("blob", blob);
	image.src = URL.createObjectURL(blob);
}

function onChannel(channel, peerId) {
	clients[peerId].channel = channel;

	channel.onopen = () => {
		console.log("channel opened");

		channel.send(`Hello from ${ownId}`);
	};

	channel.onmessage = event => {
		const message = event.data;

		console.log("new message");
		if (message.startsWith("{") && message.endsWith("}")) {
			const data = JSON.parse(message);

			if (data.message === "header") {
				console.log("data", data);

				type = data.type;

				fileArray = [];
			} else if (data.message === "chunk") {
				fileArray.push(...data.data);
			} else if (data.message === "eof") {
				onFileComplete();
			}
		} else {
			console.log(message);
		}

		// messagesView.appendChild(document.createElement("p")).innerHTML = `${peerId}: ${event.data}`;
	};
}
