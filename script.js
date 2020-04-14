// Generate random room name
if (!location.hash) {
    location.hash = Math.floor(Math.random() * 0xFFFFFF).toString(16);
}
const roomHash = location.hash.substring(1);
const drone = new ScaleDrone('yiS12Ts5RdNhebyM');
// Room name needs to be prefixed with 'observable-'
const roomName = 'observable-' + roomHash;
const configuration = {
    iceServers: [{
        urls: 'stun:stun.l.google.com:19302'
    }]
};
let room;
let pc;

function onSuccess() {
};

function onError(error) {
    console.error(error);
};

// Send signaling data via Scaledrone
function sendMessage(message) {
    drone.publish({
        room: roomName,
        message
    });
}

drone.on('open', error => {

    if (error) {
        return console.error(error);
    }

    room = drone.subscribe(roomName);
    room.on('open', error => {
        if (error) {
            onError(error);
        }
    });

    // We're connected to the room and received an array of 'members'
    room.on('members', members => {
        console.log('MEMBERS', members);
        // If we are the second user to connect to the room we will be creating the offer
        members.forEach(member => {
            if (member.id !== drone.clientId) {
                createVideoElement(member);
                startWebRTC(true, member);
            }
        });
    });

    // Event is emitted when a new member joins the room.
    room.on('member_join', member => {
        console.log("New member joined call:", member);
        createVideoElement(member);
        startWebRTC(false, member);
    });
});

function createVideoElement(member) {
    const video = document.createElement("video");
    video.setAttribute("id", "remote" + member.id);
    video.autoplay = true;
    document.body.appendChild(video);
}

function startWebRTC(isOfferer, member) {
    pc = new RTCPeerConnection(configuration);

    // 'onicecandidate' notifies us whenever an ICE agent needs to deliver a
    // message to the other peer through the signaling server
    pc.onicecandidate = event => {
        if (event.candidate) {
            sendMessage({'candidate': event.candidate});
        }
    };

    // If user is offerer let the 'negotiationneeded' event create the offer
    if (isOfferer) {
        pc.onnegotiationneeded = () => {
            pc.createOffer().then(function (desc) {
                return pc.setLocalDescription(desc, () => sendMessage({'sdp': pc.localDescription}), onError);
            }).catch(onError);
        }
    }

    // When a remote stream arrives display it in the #remoteVideo element
    pc.ontrack = event => {
        const stream = event.streams[0];
        const remoteVideo = document.getElementById("remote" + member.id);
        if (!remoteVideo.srcObject || remoteVideo.srcObject.id !== stream.id) {
            remoteVideo.srcObject = stream;
        }
    };

    navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true,
    }).then(stream => {
        // Display your local video in #localVideo element
        localVideo.srcObject = stream;
        // Add your stream to be sent to the conneting peer
        stream.getTracks().forEach(track => pc.addTrack(track, stream));
    }, onError);

    // Listen to signaling data from Scaledrone
    room.on('data', (message, client) => {
        // Message was sent by us
        if (client.id === drone.clientId) {
            return;
        }

        if (message.sdp) {
            // This is called after receiving an offer or answer from another peer
            pc.setRemoteDescription(new RTCSessionDescription(message.sdp), () => {
                // When receiving an offer lets answer it
                if (pc.remoteDescription.type === 'offer') {
                    pc.createAnswer().then(function (desc) {
                        return pc.setLocalDescription(desc, () => sendMessage({'sdp': pc.localDescription}), onError);
                    }).catch(onError);
                }
            }, onError);
        } else if (message.candidate) {
            // Add the new ICE candidate to our connections remote description
            pc.addIceCandidate(
                new RTCIceCandidate(message.candidate), onSuccess, onError
            );
        }
    });
}