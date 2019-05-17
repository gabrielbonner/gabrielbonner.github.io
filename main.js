//RTCPeerConnection = webkitRTCPeerConnection || RTCPeerConnection || window.mozRTCPeerConnection;
//URL = webkitURL || URL;
navigator.getUserMedia = cordova.plugins.iosrtc.GetUserMedia;
windowURL = window.URL || window.webkitURL || window.mozURL || window.msURL;


var request = null;
var hangingGet = null;
var localName;
var server;
var my_id = -1;
var other_peers = {};
var message_counter = 0;
var localVideo;
var remoteVideo;
var localStream;
var started = false;
var signed_In = false;
var mediaTrackConstraints = {'has_audio':true, 'has_video':true};
var isRTCPeerConnection = true;
var pc;
var notMultiSession = true;
var activeCall = false;
var connectedPeerName;
var connectedPeerId;
var onlyASCII = true;

var zoomed = false;
var isFirefox = false;
if (navigator.mozGetUserMedia) {
    isFirefox = true;
}

var localConstraints = {
    audio:true,
    video:{
        mandatory: {
            minWidth: 640,
            minHeight: 480
        }
    }
};

var mediaConstraints = {
    'mandatory': {
        'OfferToReceiveAudio': true,
        'OfferToReceiveVideo': true
    }
};

var sdpConstraints = {
    optional: [{
            DtlsSrtpKeyAgreement: true
        }, {
            RtpDataChannels: true
        }]
};

function changeVideoStreamStyles(remoteExist){
    if ((remoteExist)) {
        if (isFirefox) {
            document.getElementById("iddivlocal").style["animation"] = "connectAnimation 0.5s forwards linear ";
            //document.getElementById("iddivlocal").style["-moz-animation-fill-mode"] = "forwards";
            //document.getElementById("iddivlocal").style["-moz-animation-timing-function"] = "linear";
        } else {
            document.getElementById("iddivlocal").style["-webkit-animation"] = "connectAnimation 0.5s";
            document.getElementById("iddivlocal").style["-webkit-animation-fill-mode"] = "forwards";
            document.getElementById("iddivlocal").style["-webkit-animation-timing-function"] = "linear";
        }
        zoomed = true;
    } else if ((zoomed) && (!remoteExist)) {
        if (isFirefox) {
            document.getElementById("iddivlocal").style["animation"] = "disconnectAnimation 0.5s forwards linear";
            //document.getElementById("iddivlocal").style["-moz-animation-fill-mode"] = "forwards";
            //document.getElementById("iddivlocal").style["-moz-animation-timing-function"] = "linear";
        } else {
            document.getElementById("iddivlocal").style["-webkit-animation"] = "disconnectAnimation 0.5s";
            document.getElementById("iddivlocal").style["-webkit-animation-fill-mode"] = "forwards";
            document.getElementById("iddivlocal").style["-webkit-animation-timing-function"] = "linear";
        }
        zoomed = false;
    }
}

function checkDebug() {
    if (document.getElementById("showDebug").checked) {
        document.getElementById("debug").style["visibility"] = "visible";
        document.getElementById("clearLog").style["visibility"] = "visible";
    } else {
        document.getElementById("debug").style["visibility"] = "hidden";
        document.getElementById("clearLog").style["visibility"] = "hidden";
    }
}

function checkCoding() {
    if (document.getElementById("onlyASCII").checked) {
        onlyASCII = true;
    } else onlyASCII = false;
}

function trace(txt) {
    var elem = document.getElementById("debug");
    elem.innerHTML += txt + "<br>";
    console.log(txt);
}

function handleServerNotification(data) {
    trace("Server notification: " + data);
    var parsed = data.split(',');
    var peer_id = parseInt(document.getElementById("peer_id").value);
    if (parseInt(parsed[1]) == peer_id && parseInt(parsed[2]) == 0) {
        onRemoteHangup();
    }

    var peerId = parseInt(parsed[1]);
    trace("handleServerNotification peerId= " + peerId);
    if (parseInt(parsed[2]) != 0) {
        updatePeers(true, peerId, parsed[0]);
    } else {
        if (other_peers[peerId] != "undefined") {
            updatePeers(false, peerId, "");
        }
    }

    trace("number of peers " + Object.keys(other_peers).length);
    trace("otherPeers " + parseInt(parsed[1]) + "=" + parsed[0]);
}

function handlePeerMessage(peer_id, data) {
    trace("handlePeerMessage from peer " + peer_id + " data " + data);
    processSignalingMessage(data, peer_id);

    ++message_counter;
    var str = "Message from '" + other_peers[peer_id] + "';";
    str += "<span id='toggle_" + message_counter + "' onclick='toggleMe(this);' ";
    str += "style='cursor: pointer'>+</span><br>";
    str += "<blockquote id='msg_" + message_counter + "' style='display:none'>";
    str += data + "</blockquote>";
    trace(str);
}

function GetIntHeader(r, name) {
    var val = r.getResponseHeader(name);
    return val != null && val.length ? parseInt(val) : -1;
}

function hangingGetCallback() {
    trace("hangingGetCallback");
    try {
        if (hangingGet.readyState != 4)
            return;
        if (hangingGet.status != 200) {
            trace("server error: " + hangingGet.statusText);
            disconnect();
        } else {
            var peer_id = GetIntHeader(hangingGet, "Pragma");
            if (peer_id == my_id) {
                handleServerNotification(hangingGet.responseText);
            } else {
                connectedPeerId = peer_id;
                connectedPeerName = other_peers[peer_id];
                handlePeerMessage(peer_id, hangingGet.responseText);
            }
        }

        if (hangingGet) {
            hangingGet.abort();
            hangingGet = null;
        }

        if (my_id != -1)
            window.setTimeout(startHangingGet, 0);
    } catch (e) {
        trace("Hanging get error: " + e.description);
    }
}

function startHangingGet() {
    trace("startHangingGet");
    try {
        trace("startHangingGet ");
        hangingGet = new XMLHttpRequest();
        hangingGet.onreadystatechange = hangingGetCallback;
        hangingGet.ontimeout = onHangingGetTimeout;
        hangingGet.open("GET", server + "/wait?peer_id=" + my_id, true);
        hangingGet.send();
    } catch (e) {
        trace("error" + e.description);
    }
}

function onHangingGetTimeout() {
    trace("hanging get timeout. issuing again.");
    hangingGet.abort();
    hangingGet = null;
    if (my_id != -1)
        window.setTimeout(startHangingGet, 0);
}

function signInCallback() {
    trace("signInCallback");
    try {
        if (request.readyState == 4) {
            if (request.status == 200) {
                var peers = request.responseText.split("\n");
                my_id = parseInt(peers[0].split(',')[1]);
                document.getElementById("myID").innerHTML = "My ID: " + my_id;
                trace("My id: " + my_id);
                trace("peers: " + peers);
                for (var i = 1; i < peers.length; ++i) {
                    if (peers[i].length > 0) {
                        trace("Peer " + i + ": " + peers[i]);
                        var parsed = peers[i].split(',');
                        updatePeers(true, parseInt(parsed[1]), parsed[0]);
                    }
                }
                document.getElementById("server").disabled = true;
                document.getElementById("local").disabled = true;
                setButton(false);
                startHangingGet();
                request = null;
                signed_In = true;
                showSignInStatus();
                initializePeerConnection();
            }
        }
    } catch (e) {
        trace("error: " + e.description);
    }
}

function signIn() {
    trace("signIn");
    try {
        request = new XMLHttpRequest();
        request.onreadystatechange = signInCallback;
        request.open("GET", server + "/sign_in?" + localName, true);
        request.send();
    } catch (e) {
        trace("error: " + e.description);
    }
}

function sendToPeer(peer_id, data) {
    trace("sendToPeer " + peed_id);
    if (my_id == -1) {
        alert("Not connected");
        return;
    }
    if (peer_id == my_id) {
        alert("Can't send a message to oneself :)");
        return;
    }
    var r = new XMLHttpRequest();
    r.open("POST", server + "/message?peer_id=" + my_id + "&to=" + peer_id, false);
    r.setRequestHeader("Content-Type", "text/plain");
    r.send(data);
    r = null;
}

function encode_utf8(s) {
    return window.btoa(unescape(encodeURIComponent(s)))
}

function decode_utf8(s) {
    return decodeURIComponent(escape(window.atob(s)));
}

function connect() {
    trace("connect");
    var str = document.getElementById("local").value;
    if (str) {
        if (onlyASCII)
            var test = str;
        else
            var test = encode_utf8(str);

        localName = test;
        server = document.getElementById("server").value.toLowerCase();
        if (localName.length == 0) {
            alert("I need a name please.");
            document.getElementById("local").focus();
        } else {
            signIn();
        }
    } else {
        alert("Please enter you name");
        document.getElementById("local").focus();
    }
}

function clearOtherPeers() {
    var peerKeys = Object.keys(other_peers);
    for (i = 0; i < peerKeys.length; i++) {
        updatePeers(false, peerKeys[i], "");
    }
}

function disconnect() {
    if (request) {
        request.abort();
        request = null;
    }

    if (hangingGet) {
        hangingGet.abort();
        hangingGet = null;
    }

    if (my_id != -1) {
        request = new XMLHttpRequest();
        request.open("GET", server + "/sign_out?peer_id=" + my_id, false);
        request.send();
        request = null;
        my_id = -1;
    }
    document.getElementById("server").disabled = false;
    document.getElementById("local").disabled = false;
    document.getElementById('debug').innerHTML = '';
    document.getElementById('callee').value = "";
    setButton(true);
    activeCall = false;
    signed_In = false;
    clearOtherPeers();
    showSignInStatus();
    changeVideoStreamStyles(false);
}

window.onbeforeunload = disconnect;

function createPeerConnection() {
    trace("createPeerConnection");
    var pc_config = {
        "iceServers": [{
                "url": "stun:stun.l.google.com:19302;turn:89.108.113.194:3478|webrtc|webrtc;"
            }]
    };
    try {
        //pc = new webkitRTCPeerConnection(pc_config);
        pc = cordova.plugins.iosrtc.RTCPeerConnection(pc_config);

        pc.onicecandidate = onIceCandidate;
        trace("Created RTCPeerConnnection with config \"" + JSON.stringify(pc_config) + "\".");
    } catch (e) {
        trace("Failed to create PeerConnection, exception: " + e.message);
        alert("Cannot create PeerConnection object; Is the 'PeerConnection' flag enabled in about:flags?");
        return;
    }

    pc.onconnecting = onSessionConnecting;
    pc.onopen = onSessionOpened;
    pc.onaddstream = onRemoteStreamAdded;
    pc.onremovestream = onRemoteStreamRemoved;
}

function findCalleePeer() {
    var peerKeys = Object.keys(other_peers);
    var calleeName = document.getElementById("callee").value
    for (var i in peerKeys) {
        trace("other_peer[" + peerKeys[i] + "]=" + other_peers[peerKeys[i]]);
        if (other_peers[peerKeys[i]] == calleeName) {
            return peerKeys[i];
        }
    }
    return 0;
}

function call() {
    var peer_id = findCalleePeer();
    trace("peer_id:" + peer_id);
    if (peer_id == 0) {
        alert("Invalid peer name");
    } else {
        setButton(true);
        connectedPeerId = peer_id;
        //sendMessage({type: 'Icallyou'});
        doCall();
    }
}

function hangup() {
    setButton(false);
    connectedPeerId = document.getElementById("peer_id").value;
    sendMessage({type: 'bye'});
    document.getElementById('callee').value = "";
    activeCall = false;
    stop();
}

function toggleMe(obj) {
    var id = obj.id.replace("toggle", "msg");
    var t = document.getElementById(id);
    if (obj.innerText == "+") {
        obj.innerText = "-";
        t.style.display = "block";
    } else {
        obj.innerText = "+";
        t.style.display = "none";
    }
}

function initializePeerConnection()  {
    localVideo = document.getElementById("selfView");
    remoteVideo = document.getElementById("remote");
    //Ask for local streams to be prepared, display self view

    if (!started && localStream && signed_In) {
        trace("Creating PeerConnection.");
        createPeerConnection();
        trace("Adding local stream.");
        pc.addStream(localStream);
        trace("started = true");
        started = true;
    }
};

function setFocus() {
    document.getElementById("local").focus();
}

function gotStream(stream) {
    localStream = stream;
     trace("lOCAL stream added.1");
    var url = windowURL.createObjectURL(localStream);
     trace("lOCAL stream added.2");
    localVideo.style.opacity = 1;
     trace("lOCAL stream added.3");
    localVideo.src = url;
     trace("lOCAL stream added.4");

    trace("lOCAL stream added.5");
    document.getElementById("selfView").style.display="block";
    document.getElementById("local").focus();
    setTimeout(setFocus(), 1000);
}

function onUserMediaError(error) {
    trace("Failed to get access to local media. Error code was " + error.code);
    alert("Failed to get access to local media. Error code was " + error.code + ".");
}

function onIceCandidate(event) {
    trace("onIceCandidate(event).");
    if (event.candidate) {
        sendMessage({
                        type: 'candidate',
                        sdpMLineIndex: event.candidate.sdpMLineIndex,
                        sdpMid: event.candidate.sdpMid,
                        candidate: event.candidate.candidate});
    } else {
        trace("End of candidates.");
    }
}

function onSessionConnecting(message) {
    trace("Session connecting.");
}
function onSessionOpened(message) {
    trace("Session opened.");
}

function onRemoteStreamAdded(event) {
    document.getElementById("remote").style.display="block";
    var url = windowURL.createObjectURL(event.stream);
    remoteVideo.src = url;
    remoteStream = event.stream;
    changeVideoStreamStyles(true);
}

function onRemoteStreamRemoved(event) {
    trace("Remote stream removed.");
}

function setLocalAndSendMessage(sessionDescription) {
    trace("pc.setLocalDescription() in setLocalAndSendMessage.");
    pc.setLocalDescription(sessionDescription);
    sendMessage(sessionDescription);
}

function rtcPeerConnectionErrorCallBack(err) {
    trace("rtcPeerConnectionErrorCallBack.");
}

function sendMessage(message) {
    var msgString = JSON.stringify(message);
    var peer_id = connectedPeerId;
    trace('sendMessage to peer_id:' + peer_id + ' msgString: ' + msgString);
    var xhr = new XMLHttpRequest();
    xhr.open('POST', server + "/message?peer_id=" + my_id + "&to=" + peer_id, true);
    xhr.setRequestHeader("Content-Type", "text/plain");
    xhr.send(msgString);
    xhr = null;
}

function setButton(calling) {
    //trace("setButton");
    var targetChild;
    var lastChild;
    var peerChildCount;
    var firstChild;
    var id;
    var peerCallList = document.getElementsByName("peer");
    if (calling) {
        for (elem in peerCallList) {
            firstChild = peerCallList[elem];
            //trace(firstChild.id + ", peer"+connectedPeerId);
            if (firstChild.id === ("peer"+connectedPeerId)) {
                peerChildCount = firstChild.childElementCount;
                //trace("child of peer " + peerChildCount);
                for (var i = 0; i < peerChildCount; i++) {
                    lastChild = firstChild.childNodes[i];
                    //trace("name of child of peer " + lastChild.id);
                    if (lastChild.id === "buttons") {
                        for (var j = 0; j < lastChild.childElementCount; j++) {
                            targetChild = lastChild.childNodes[j];
                            if (targetChild.getAttribute("name") === "call") {
                                targetChild.disabled = true;
                                targetChild.childNodes[0].src = "phone-answer-gray-th.png";
                            } else {
                                targetChild.disabled = false;
                                targetChild.childNodes[0].src = "phone-hang-up-red-th.png";
                            }
                        }
                    }
                }
            } else {
                peerChildCount = firstChild.childElementCount;
                //trace("child of peer " + peerChildCount);
                for (var i = 0; i < peerChildCount; i++) {
                    lastChild = firstChild.childNodes[i];
                    //trace("name of child of peer " + lastChild.id);
                    if (lastChild.id === "buttons") {
                        for (var j = 0; j < lastChild.childElementCount; j++) {
                            targetChild = lastChild.childNodes[j];
                            if (targetChild.getAttribute("name") === "call") {
                                targetChild.disabled = true;
                                targetChild.childNodes[0].src = "phone-answer-gray-th.png";
                            }
                        }
                    }
                }
            }
        }
    } else {
        for (elem in peerCallList) {
            firstChild = peerCallList[elem];
            //trace("not calling " + firstChild.id + ", peer"+connectedPeerId);
            peerChildCount = firstChild.childElementCount;
            //trace("child of peer " + peerChildCount);
            for (var i = 0; i < peerChildCount; i++) {
                lastChild = firstChild.childNodes[i];
                //trace("name of child of peer " + lastChild.id);
                if (lastChild.id === "buttons") {
                    for (var j = 0; j < lastChild.childElementCount; j++) {
                        targetChild = lastChild.childNodes[j];
                        if (targetChild.getAttribute("name") === "call") {
                            targetChild.disabled = false;
                            targetChild.childNodes[0].src = "phone-answer-green-th.png";
                        } else {
                            targetChild.disabled = true;
                            targetChild.childNodes[0].src = "phone-hang-up-gray-th.png";
                        }
                    }
                }
            }
        }
    }
}

var CallAnswerErrorCallBack = function(e) {
    trace("Something wrong happened when answer or offer " + e.toString());
};

var mergeConstraints = function(cons1, cons2) {
    var merged = cons1;
    for (var name in cons2.mandatory) merged.mandatory[name] = cons2.mandatory[name];
    merged.optional.concat(cons2.optional);
    return merged;
};

function doCall() {
    trace("Sending offer to peer.");

    if (!started && localStream && signed_In) {
        trace("Creating PeerConnection.");
        createPeerConnection();
        trace("Adding local stream.");
        pc.addStream(localStream);
        trace("started = true");
        started = true;
    }

    setButton(true);

    if (isFirefox) {
        var constraints = {
            "optional": [],
            "mandatory": {
                "mozDontOfferDataChannel": true
            }
        };

        constraints = mergeConstraints(constraints, mediaConstraints);
        trace("Sending offer to peer, with constraints: \n  \"" + JSON.stringify(constraints) + "\".")
        pc.createOffer(setLocalAndSendMessage, CallAnswerErrorCallBack, constraints);
    } else {
        trace("pc.createOffer in doCall().Sending offer to peer, with constraints: \n  \"" + JSON.stringify(mediaConstraints) + "\".");
        pc.createOffer(setLocalAndSendMessage, CallAnswerErrorCallBack, mediaConstraints);
    }
    activeCall = true;
}

function doAnswer() {
    trace("Sending answer to peer.");
    setButton(true);

    pc.createAnswer(setLocalAndSendMessage, CallAnswerErrorCallBack, mediaConstraints);

    activeCall = true;
}

function inputNameEnter() {
    console.log("inputNameEnter");
    document.getElementById("connect").click();
}

function createRTCSessionDescription(msg) {
    trace("createRTCSessionDescription ");
    var SessionDescription = isFirefox ? new window.mozRTCSessionDescription(msg) : new RTCSessionDescription(msg);
    return SessionDescription;
}

function processSignalingMessage(message, peer_id) {
    var msg = JSON.parse(message);

    trace("processSignalingMessage msg.type=" + msg.type);
    if (msg.type === 'offer') {
        document.getElementById("callee").value = other_peers[peer_id];
        document.getElementById("peer_id").value = peer_id;

        trace('pc.setRemoteDescription() in offer');
        pc.setRemoteDescription(createRTCSessionDescription(msg));

        trace("processSignalingMessage msg.type=" + msg.type);

        doAnswer();
    } else if (msg.type === 'answer' && started) {
        trace("processSignalingMessage msg.type=" + msg.type);
        pc.setRemoteDescription(createRTCSessionDescription(msg));
    } else if (msg.type === 'candidate' && started) {

        trace("processSignalingMessage msg.type=" + msg.type + " msg:" + msg);
        var candidate = isFirefox ? new mozRTCIceCandidate({
                                                               sdpMLineIndex: msg.sdpMLineIndex,
                                                               candidate: msg.candidate
                                                           }) : new RTCIceCandidate({
                                                                                        sdpMLineIndex: msg.sdpMLineIndex,
                                                                                        candidate: msg.candidate
                                                                                    });
        trace('pc.addIceCandidate() in candidate');
        pc.addIceCandidate(candidate);
    } else if (msg.type === 'bye' && started) {
        onRemoteHangup();
    } else if (msg.type === 'Icallyou') {
        if (!activeCall) {
            if (confirm("Do you accept call from " + other_peers[peer_id] + "?")) {
                sendMessage({type: 'Iagree'});
            } else {
                sendMessage({type: 'Ireject'});
            }
        } else sendMessage({type: 'Imbusy'});
    } else if (msg.type === 'Iagree') {
        document.getElementById("callee").value = other_peers[peer_id];
        document.getElementById("peer_id").value = peer_id;
        doCall();
    } else if (msg.type === 'Ireject') {
        document.getElementById('callee').value = "";
        setButton(false);
        alert("Callee reject you call");
    } else if (msg.type === 'Imbusy') {
        document.getElementById('callee').value = "";
        setButton(false);
        alert("Callee is busy now");
    }
}

function onRemoteDisconnect() {
    console.log("onRemoteDisconnect");
}

function onRemoteHangup() {
    console.log("onRemoteHangup");
    trace('Session terminated.');
    setButton(false);
    stop();
}

function stop() {
    console.log("stop");
    trace('stop.');
    started = false;
    isRTCPeerConnection = true;
    pc.close();
    pc = null;
    document.getElementById('callee').value = "";
    activeCall = false;
    initializePeerConnection();
    changeVideoStreamStyles(false);
}

function updatePeers(add, peerId, name) {
    console.log("updatePeers");
    trace("updatePeers " + add + ", peer " + peerId + ", name " + name);
    var peerView = document.getElementById("peersLog");
    if (add) {
        var peerKeys = Object.keys(other_peers);
        if (peerKeys.length == 0) {
            peerView.innerHTML = "";
        }
        if (onlyASCII)
            var decodeName = name;
        else
            var decodeName = decode_utf8(name);
        trace("name = " + name + " decodeName = " + decodeName);
        other_peers[peerId] = decodeName;
        createPeerToCall(decodeName, peerId, peerView);
    } else {
        delete other_peers[peerId];
        deletePeerRow(peerId);
        var peerKeys = Object.keys(other_peers);
        if (peerKeys.length == 0) {
            peerView.innerHTML = "No available peers.";
        }
    }
}

function showSignInStatus() {
    var avPeers = document.getElementById("availablePeers");
    var peerData = document.getElementById("idpeersData");
    trace("showPeers signed_In=" + signed_In);
    if (signed_In) {
        avPeers.innerHTML = "Available peers";
        peerData.style["visibility"] = "visible";
        document.getElementById("connect").disabled = true;
        document.getElementById("disconnect").disabled = false;
    } else {
        avPeers.innerHTML = "";
        peerData.style["visibility"] = "hidden";
        document.getElementById("connect").disabled = false;
        document.getElementById("disconnect").disabled = true;
    }
}

function callThisPeer(peer_id) {
    document.getElementById("callee").value = other_peers[peer_id];
    document.getElementById("peer_id").value = peer_id;
    connectedPeerId = peer_id;
    call();
}

function createPeerToCall(name, peerId, elem) {
    trace("createPeerToCall name=" + name);
    var table = document.getElementById("peersLog");
    var rowCount = table.rows.length;

    var row = table.insertRow(rowCount);
    row.setAttribute("name", "peer");
    row.setAttribute("id", "peer" + peerId);
    var newcell0 = row.insertCell(0);
    newcell0.style["witdh"] = "60px";
    newcell0.setAttribute("id", "buttons");
    newcell0.setAttribute("class", "peerInfo");
    if (!activeCall) {
        newcell0.innerHTML = '<button name="call" class="imgbutton" id="' + peerId + '" onclick="callThisPeer(this.id)">' +
                '<img id="imgCall" src="phone-answer-green-th.png"/></button>' +
                '<button name="hangup" class="imgbutton" id="hangup" onClick="hangup()" disabled=true>' +
                '<img id="imgHangUp" src="phone-hang-up-gray-th.png"/></button></td>';
    } else {
        newcell0.innerHTML = '<button name="call" class="imgbutton" id="' + peerId + '" onclick="callThisPeer(this.id)" disabled=true>' +
                '<img id="imgCall" src="phone-answer-gray-th.png"/></button>' +
                '<button name="hangup" class="imgbutton" id="hangup" onClick="hangup()" disabled=true>' +
                '<img id="imgHangUp" src="phone-hang-up-gray-th.png"/></button></td>';
    }
    var newcell1 = row.insertCell(1);
    newcell1.setAttribute("id", "info");
    newcell1.setAttribute("class", "peerName");
    newcell1.innerHTML = '<b>' + name + '</b>';
}

function deletePeerRow(peerId) {
    var peerElem = document.getElementById("peer" + peerId);
    var table = document.getElementById("peersLog");

    var index = peerElem.rowIndex;
    table.deleteRow(index);
}

function onLoad() {
    console.log("onLoad");
    showSignInStatus();
    localVideo = document.getElementById("selfView");
    remoteVideo = document.getElementById("remote");
    //Ask for local streams to be prepared, display self view
    document.getElementById("debug").style["visibility"] = "hidden";
    document.getElementById("peersLog").innerHTML = "No available peers.";
    document.getElementById("peersLog").style["left"] = "0px";
    document.getElementById('local').onkeypress=function(e){
        if(e.keyCode==13){
            document.getElementById('connect').click();
        }
    }

    document.getElementById("onlyASCII").cheched = true;

    try {
cordova.plugins.iosrtc.getUserMedia(
  // constraints
  { audio: true, video: true },
  // success callback
  function (stream) {
    console.log('got local MediaStream: ', stream);

    pc.addStream(stream);
  },
  // failure callback
  function (error) {
    console.error('getUserMedia failed: ', error);
  }
);
        trace("Requested access to local media with new syntax.");
    } catch (e) {
        try {
cordova.plugins.iosrtc.getUserMedia(
  // constraints
  { audio: true, video: true },
  // success callback
  function (stream) {
    console.log('got local MediaStream: ', stream);

    pc.addStream(stream);
  },
  // failure callback
  function (error) {
    console.error('getUserMedia failed: ', error);
  }
);            trace("Requested access to local media with old syntax.");
        } catch (e) {
            alert("GetUserMedia() failed. Is the MediaStream flag enabled in about:flags?");
            trace("GetUserMedia failed with exception: " + e.message);
        }
    }
}
