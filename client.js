// utils
const logs = document.getElementById("logs");
const input = document.getElementById("messageInput");

function log(message) {
    logs.value += "[" + message.event + "] " + message.data + ": " + message.type + "\n";
}

// signaling server
const peerConnections = [];
const dataChannels = [];
let myUuid = null;
const conn = new WebSocket('wss://ec2-54-162-144-47.compute-1.amazonaws.com:8080//socket');

conn.onopen = () => {
    // todo: support other browsers
    log({event: "WARNING", data: "Chrome only", type: "So sorry, JS is so stupid"});

    const message = {event: "AUTH", data: "Connected to socket"};
    console.log(message.data);
    conn.send(JSON.stringify(message));
};

conn.onmessage = event => {
    const message = JSON.parse(event.data);
    console.log(event.data);

    switch (message.event) {
        case "AUTH":
            log(message);
            myUuid = message.data;
            break;
        case "USER":
            handleUsers(message);
            break;
        case "OFFER":
            handleOffer(message);
            break;
        case "ANSWER":
            handleAnswer(message);
            break;
        case "CANDIDATE":
            handleCandidate(message);
            break;
        default:
            log(message);
            break;
    }
};

// webRTC handling
handleUsers = message => {
    log(message);
    switch (message.type) {
        case "UP":
            createRTC(message.data);
            break;
        case "DOWN":
            removeRTC(message.data);
            break;
        case "CANDIDATE":
            createRTC(message.data);
            offerRTC(message.data);
            break;
        default:
            break;
    }
};

removeRTC = uuid => {
    const message = {event: "RTC", data: "Removing RTC peer", type: uuid};
    log(message);
    delete peerConnections[uuid];
    delete dataChannels[uuid];
};

createRTC = uuid => {
    const message = {event: "RTC", data: "Creating RTC peer for new user", type: uuid};
    log(message);
    console.log(JSON.stringify(message));

    const configuration = {
        iceServers: [{
            urls: 'stun:stun.l.google.com:19302'
        }]
    };

    const peerConnection = new RTCPeerConnection(
        configuration,
        {
            optional: [{
                RtpDataChannels: true
            }]
        }
    );

    peerConnection.onicecandidate = event => {
        if (event.candidate && peerConnection.connectionState !== "connected") {
            const message = {event: "CANDIDATE", data: event.candidate, type: uuid};
            conn.send(JSON.stringify(message));
        }
    };

    peerConnection.connected = false;

    const dataChannel = peerConnection.createDataChannel("dataChannel");

    dataChannel.onerror = function (error) {
        const message = {event: "ERROR", data: error, type: uuid};
        log(message);
        conn.send(JSON.stringify(message));
    };

    dataChannel.onmessage = function (event) {
        log({event: "MSG", data: uuid, type: event.data});
    };

    dataChannel.onclose = function () {
        log({event: "DATA", data: "Data channel is closed", type: uuid});
    };

    dataChannels[uuid] = dataChannel;
    peerConnections[uuid] = peerConnection;
};

handleOffer = message => {
    const peerConnection = peerConnections[message.type];
    const offer = message.data;

    if (!peerConnection.connected && peerConnection.connectionState !== "connected") {

        console.log("Handling offer from " + message.type);

        peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        peerConnection.createAnswer(function (answer) {
            peerConnection.setLocalDescription(answer);
            const msg = {event: "ANSWER", data: answer, type: message.type};
            conn.send(JSON.stringify(msg));
        }, function (error) {
            console.log(error);
        });
    }
};

offerRTC = uuid => {
    const peerConnection = peerConnections[uuid];

    if (!peerConnection.connected && peerConnection.connectionState !== "connected") {

        console.log("Offering for " + uuid);
        peerConnection.createOffer(function (offer) {
            const message = {event: "OFFER", data: offer, type: uuid};
            conn.send(JSON.stringify(message));
            peerConnection.setLocalDescription(offer);
        }, function (error) {
            console.log(error);
        });
    }
};

handleCandidate = message => {
    const candidate = message.data;
    const peerConnection = peerConnections[message.type];

    console.log("Handling candidate from " + message.type);
    if (!peerConnection.connected && peerConnection.connectionState !== "connected") {
        peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    }
};

handleAnswer = message => {
    const answer = message.data;
    const peerConnection = peerConnections[message.type];

    console.log("Handling answer from " + message.type);
    if (!peerConnection.connected && peerConnection.connectionState !== "connected") {
        peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        peerConnection.connected = true;
        log({event: "INFO", data: "Connection established successfully", type: message.type});
    }
};

sendMessage = () => {
    log({event: "MSG", data: myUuid, type: input.value});
    for (let uuid in dataChannels) {
        console.log(uuid);
        const dataChannel = dataChannels[uuid];
        dataChannel.send(input.value);
    }
    input.value = "";
};
