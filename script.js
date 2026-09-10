import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
    getFirestore, doc, getDoc, setDoc, updateDoc, arrayUnion,
    collection, addDoc, query, where, orderBy, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
    getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
    onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getMessaging, getToken } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js";

const firebaseConfig = {
    apiKey: "AIzaSyCqiWdeHaQt-UIxihQHOmgbd8uOY1W7MNc",
    authDomain: "firechat-f4ae8.firebaseapp.com",
    projectId: "firechat-f4ae8",
    storageBucket: "firechat-f4ae8.firebasestorage.app",
    messagingSenderId: "332930002045",
    appId: "1:332930002045:web:fd15393fddb7ef45cb1514"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const FAKE_EMAIL_DOMAIN = '@firechat.local';

// --- element references ---
const authScreen = document.getElementById('auth-screen');
const chatsScreen = document.getElementById('chats-screen');
const chatScreen = document.getElementById('chat-screen');

const usernameInput = document.getElementById('username-input');
const passwordInput = document.getElementById('password-input');
const mainBtn = document.getElementById('main-btn');
const toggleBtn = document.getElementById('toggle-btn');
const tagline = document.getElementById('tagline');

const currentUsernameEl = document.getElementById('current-username');
const signoutBtn = document.getElementById('signout-btn');
const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');
const searchError = document.getElementById('search-error');
const contactsList = document.getElementById('contacts-list');

const backBtn = document.getElementById('back-btn');
const chatAvatar = document.getElementById('chat-avatar');
const chatWithName = document.getElementById('chat-with-name');
const messagesArea = document.getElementById('messages-area');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');

let mode = 'signup';
let currentUser = null;
let activeChatWith = null;
let unsubscribeMessages = null;
let unsubscribeContacts = null;

// --- auth mode toggle ---
toggleBtn.addEventListener('click', () => {
    if (mode === 'signup') {
        mode = 'login';
        mainBtn.textContent = 'Sign in';
        toggleBtn.textContent = "No account? Create one";
        tagline.textContent = 'Sign in with your username and password.';
    } else {
        mode = 'signup';
        mainBtn.textContent = 'Create account';
        toggleBtn.textContent = "Have an account? Sign in";
        tagline.textContent = 'Pick a username. No phone, no email.';
    }
});

mainBtn.addEventListener('click', async () => {
    const username = usernameInput.value.trim().toLowerCase();
    const password = passwordInput.value;

    if (!username || !password) {
        alert('Enter a username and password.');
        return;
    }
    if (!/^[a-z0-9_]{3,20}$/.test(username)) {
        alert('Username: 3-20 characters, letters, numbers, and underscores only.');
        return;
    }

    const fakeEmail = username + FAKE_EMAIL_DOMAIN;

    if (mode === 'signup') {
        try {
            await createUserWithEmailAndPassword(auth, fakeEmail, password);
        } catch (err) {
            if (err.code === 'auth/email-already-in-use') {
                alert('That username is taken.');
            } else if (err.code === 'auth/weak-password') {
                alert('Password should be at least 6 characters.');
            } else {
                alert('Could not create account: ' + err.message);
            }
            return;
        }
        await setDoc(doc(db, 'users', username), { joined: Date.now() });
        await setDoc(doc(db, 'contacts', username), { list: [] });
    } else {
        try {
            await signInWithEmailAndPassword(auth, fakeEmail, password);
        } catch (err) {
            if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found') {
                alert('No account with that username, or wrong password.');
            } else {
                alert('Could not sign in: ' + err.message);
            }
            return;
        }
    }
});

onAuthStateChanged(auth, (user) => {
    if (user && user.email) {
        const username = user.email.split('@')[0];
        enterApp(username);
    } else {
        currentUser = null;
        if (unsubscribeContacts) unsubscribeContacts();
        if (unsubscribeIncomingCalls) unsubscribeIncomingCalls();
        chatsScreen.classList.add('hidden');
        chatScreen.classList.add('hidden');
        authScreen.classList.remove('hidden');
    }
});

function enterApp(username) {
    currentUser = username;
    currentUsernameEl.textContent = username;
    authScreen.classList.add('hidden');
    chatScreen.classList.add('hidden');
    chatsScreen.classList.remove('hidden');
    usernameInput.value = '';
    passwordInput.value = '';
    listenToContacts();
    listenForIncomingCalls();
    updateNotifButtonState();
}

signoutBtn.addEventListener('click', () => {
    signOut(auth);
});

// --- contacts / search ---
function listenToContacts() {
    const contactsRef = doc(db, 'contacts', currentUser);
    if (unsubscribeContacts) unsubscribeContacts();
    unsubscribeContacts = onSnapshot(contactsRef, (snap) => {
        const list = snap.exists() ? snap.data().list : [];
        renderContacts(list);
    });
}

function renderContacts(list) {
    contactsList.innerHTML = '';

    if (list.length === 0) {
        contactsList.innerHTML = '<div class="empty-state">No conversations yet. Search a username above to start one.</div>';
        return;
    }

    list.forEach(username => {
        const row = document.createElement('div');
        row.className = 'contact-row';
        row.innerHTML = `
      <div class="avatar">${username[0].toUpperCase()}</div>
      <div class="contact-name">${username}</div>
    `;
        row.addEventListener('click', () => openChat(username));
        contactsList.appendChild(row);
    });
}

searchBtn.addEventListener('click', async () => {
    searchError.textContent = '';
    const target = searchInput.value.trim().toLowerCase();
    if (!target) return;

    if (target === currentUser) {
        searchError.textContent = "That's you.";
        return;
    }

    const targetUserRef = doc(db, 'users', target);
    const targetSnap = await getDoc(targetUserRef);
    if (!targetSnap.exists()) {
        searchError.textContent = 'No user with that username.';
        return;
    }

    await setDoc(doc(db, 'contacts', currentUser), { list: arrayUnion(target) }, { merge: true });
    await setDoc(doc(db, 'contacts', target), { list: arrayUnion(currentUser) }, { merge: true });

    searchInput.value = '';
    openChat(target);
});

// --- conversation key ---
function conversationId(userA, userB) {
    return [userA, userB].sort().join('__');
}

let firstMessagesLoad = true;

function openChat(withUsername) {
    activeChatWith = withUsername;
    chatWithName.textContent = withUsername;
    chatAvatar.textContent = withUsername[0].toUpperCase();

    chatsScreen.classList.add('hidden');
    chatScreen.classList.remove('hidden');
    messagesArea.innerHTML = '';
    firstMessagesLoad = true;

    const convoId = conversationId(currentUser, withUsername);
    const messagesRef = collection(db, 'conversations', convoId, 'messages');
    const messagesQuery = query(messagesRef, orderBy('ts', 'asc'));

    if (unsubscribeMessages) unsubscribeMessages();

    unsubscribeMessages = onSnapshot(messagesQuery, (snapshot) => {
        if (!firstMessagesLoad) {
            snapshot.docChanges().forEach(change => {
                if (change.type === 'added') {
                    const msg = change.doc.data();
                    if (msg.from !== currentUser && document.hidden) {
                        showNotification(msg.from, msg.text);
                        playMessageSound();
                    }
                }
            });
        }
        firstMessagesLoad = false;

        messagesArea.innerHTML = '';
        snapshot.forEach(docSnap => {
            renderMessage(docSnap.data());
        });
        messagesArea.scrollTop = messagesArea.scrollHeight;
    });
}

function renderMessage(msg) {
    const row = document.createElement('div');
    row.className = 'bubble-row ' + (msg.from === currentUser ? 'out' : 'in');

    const time = new Date(msg.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    row.innerHTML = `
    <div class="bubble ${msg.from === currentUser ? 'out' : 'in'}">
      ${msg.text}
      <span class="bubble-time">${time}</span>
    </div>
  `;
    messagesArea.appendChild(row);
}

async function sendMessage() {
    const text = messageInput.value.trim();
    if (!text || !activeChatWith) return;

    messageInput.value = '';

    const convoId = conversationId(currentUser, activeChatWith);
    const messagesRef = collection(db, 'conversations', convoId, 'messages');

    await addDoc(messagesRef, {
        from: currentUser,
        text: text,
        ts: Date.now()
    });
}

sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendMessage();
});

backBtn.addEventListener('click', () => {
    if (unsubscribeMessages) unsubscribeMessages();
    activeChatWith = null;
    chatScreen.classList.add('hidden');
    chatsScreen.classList.remove('hidden');
});


// ==============================
// SOUND + VIBRATION
// ==============================

let audioCtx = null;
function getAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtx;
}

let audioUnlocked = false;
function unlockAudio() {
    if (audioUnlocked) return;
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') ctx.resume();
    audioUnlocked = true;
}
document.addEventListener('click', unlockAudio, { once: true });
document.addEventListener('touchstart', unlockAudio, { once: true });

function playMessageSound() {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1100, now);
    osc.frequency.exponentialRampToValueAtTime(750, now + 0.12);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.25, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.28);

    if ('vibrate' in navigator) navigator.vibrate(150);
}

let ringtoneInterval = null;

function ringOnce() {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    [0, 0.18].forEach(delay => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.0001, now + delay);
        gain.gain.exponentialRampToValueAtTime(0.3, now + delay + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.16);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now + delay);
        osc.stop(now + delay + 0.16);
    });
}

function startRingtone() {
    stopRingtone();
    ringOnce();
    ringtoneInterval = setInterval(ringOnce, 2000);

    if ('vibrate' in navigator) {
        navigator.vibrate([500, 300, 500, 300, 500, 1200]);
    }
}

function stopRingtone() {
    if (ringtoneInterval) {
        clearInterval(ringtoneInterval);
        ringtoneInterval = null;
    }
    if ('vibrate' in navigator) navigator.vibrate(0);
}


// ==============================
// NOTIFICATIONS
// ==============================

const notifBtn = document.getElementById('notif-btn');
const messaging = getMessaging(app);
const VAPID_KEY = "BMH3TdDFv7OrFThoSQhCF6FGKGxdoqfSgXT5uJrH9tlzmH0pfl2S8ywdYoC7wPJgFLtsMLhPl3rXWsM4dIeEKCw";

function updateNotifButtonState() {
    if ('Notification' in window && Notification.permission === 'granted') {
        notifBtn.classList.add('enabled');
    } else {
        notifBtn.classList.remove('enabled');
    }
}

async function registerForPush() {
    try {
        const registration = await navigator.serviceWorker.ready;
        const token = await getToken(messaging, {
            vapidKey: VAPID_KEY,
            serviceWorkerRegistration: registration
        });
        if (token) {
            await updateDoc(doc(db, 'users', currentUser), { fcmToken: token });
            console.log('Push token saved.');
        }
    } catch (err) {
        console.error('Could not get push token:', err);
    }
}

notifBtn.addEventListener('click', async () => {
    if (!('Notification' in window)) {
        alert('This browser does not support notifications.');
        return;
    }
    if (Notification.permission === 'granted') {
        alert('Notifications are already on.');
        return;
    }
    await Notification.requestPermission();
    updateNotifButtonState();
    if (Notification.permission === 'granted') {
        registerForPush();
    }
});

function showNotification(title, body) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    const notif = new Notification(title, { body });
    notif.onclick = () => {
        window.focus();
        notif.close();
    };
}


// ==============================
// CALLING (voice + video)
// ==============================

const callBtn = document.getElementById('call-btn');
const videoBtn = document.getElementById('video-btn');
const incomingCallOverlay = document.getElementById('incoming-call-overlay');
const incomingCallAvatar = document.getElementById('incoming-call-avatar');
const incomingCallName = document.getElementById('incoming-call-name');
const incomingCallStatus = document.getElementById('incoming-call-status');
const acceptCallBtn = document.getElementById('accept-call-btn');
const declineCallBtn = document.getElementById('decline-call-btn');

const callScreen = document.getElementById('call-screen');
const callAvatar = document.getElementById('call-avatar');
const callWithName = document.getElementById('call-with-name');
const callStatus = document.getElementById('call-status');
const remoteAudio = document.getElementById('remote-audio');
const remoteVideo = document.getElementById('remote-video');
const localVideo = document.getElementById('local-video');
const muteBtn = document.getElementById('mute-btn');
const cameraBtn = document.getElementById('camera-btn');
const hangupBtn = document.getElementById('hangup-btn');

const rtcConfig = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

let peerConnection = null;
let localStream = null;
let currentCallId = null;
let currentCallDocUnsub = null;
let candidatesUnsub = null;
let isCaller = false;
let unsubscribeIncomingCalls = null;
let unsubscribeRingingCallWatch = null;
let pendingCandidates = [];
let currentCallType = 'audio';
let incomingCallType = 'audio';

function listenForIncomingCalls() {
    const callsRef = collection(db, 'calls');
    const q = query(callsRef, where('to', '==', currentUser), where('status', '==', 'ringing'));

    if (unsubscribeIncomingCalls) unsubscribeIncomingCalls();

    unsubscribeIncomingCalls = onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach(change => {
            if (change.type === 'added') {
                showIncomingCall(change.doc.id, change.doc.data());
            }
        });
    });
}

function showIncomingCall(callId, callData) {
    currentCallId = callId;
    isCaller = false;
    incomingCallType = callData.type || 'audio';
    incomingCallAvatar.textContent = callData.from[0].toUpperCase();
    incomingCallName.textContent = callData.from;
    incomingCallStatus.textContent = incomingCallType === 'video' ? 'Incoming video call…' : 'Incoming call…';
    incomingCallOverlay.classList.remove('hidden');

    showNotification(
        `${incomingCallType === 'video' ? 'Incoming video call' : 'Incoming call'} — ${callData.from}`,
        'Tap to open Firechat'
    );
    startRingtone();

    if (unsubscribeRingingCallWatch) unsubscribeRingingCallWatch();
    unsubscribeRingingCallWatch = onSnapshot(doc(db, 'calls', callId), (snap) => {
        const data = snap.data();
        if (data && data.status === 'ended') {
            stopRingtone();
            incomingCallOverlay.classList.add('hidden');
        }
    });
}

declineCallBtn.addEventListener('click', async () => {
    stopRingtone();
    if (unsubscribeRingingCallWatch) { unsubscribeRingingCallWatch(); unsubscribeRingingCallWatch = null; }
    if (currentCallId) {
        await updateDoc(doc(db, 'calls', currentCallId), { status: 'ended' });
    }
    incomingCallOverlay.classList.add('hidden');
    currentCallId = null;
});

acceptCallBtn.addEventListener('click', async () => {
    stopRingtone();
    if (unsubscribeRingingCallWatch) { unsubscribeRingingCallWatch(); unsubscribeRingingCallWatch = null; }
    incomingCallOverlay.classList.add('hidden');
    const callDocSnap = await getDoc(doc(db, 'calls', currentCallId));
    const callData = callDocSnap.data();
    await answerCall(currentCallId, callData);
});

async function startCall(type) {
    if (!activeChatWith) return;
    isCaller = true;
    currentCallType = type;

    setCallScreenMode(type);
    callWithName.textContent = activeChatWith;
    callAvatar.textContent = activeChatWith[0].toUpperCase();
    callStatus.textContent = 'Calling…';
    callScreen.classList.remove('hidden');

    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: type === 'video'
        });
    } catch (err) {
        alert(`Could not access your ${type === 'video' ? 'camera/microphone' : 'microphone'}. Check permissions and try again.`);
        callScreen.classList.add('hidden');
        return;
    }

    if (type === 'video') {
        localVideo.srcObject = localStream;
    }

    peerConnection = new RTCPeerConnection(rtcConfig);
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    peerConnection.ontrack = (event) => {
        if (type === 'video') {
            remoteVideo.srcObject = event.streams[0];
        } else {
            remoteAudio.srcObject = event.streams[0];
        }
    };

    const callDocRef = doc(collection(db, 'calls'));
    currentCallId = callDocRef.id;

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            addDoc(collection(db, 'calls', currentCallId, 'callerCandidates'), event.candidate.toJSON());
        }
    };

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    await setDoc(callDocRef, {
        from: currentUser,
        to: activeChatWith,
        type: type,
        offer: { type: offer.type, sdp: offer.sdp },
        status: 'ringing',
        createdAt: Date.now()
    });

    currentCallDocUnsub = onSnapshot(callDocRef, async (snap) => {
        const data = snap.data();
        if (!data) return;

        if (data.answer && peerConnection.currentRemoteDescription === null) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
            callStatus.textContent = 'Connected';
            flushPendingCandidates();
        }

        if (data.status === 'ended') {
            endCall();
        }
    });

    candidatesUnsub = onSnapshot(collection(db, 'calls', currentCallId, 'calleeCandidates'), (snapshot) => {
        snapshot.docChanges().forEach(change => {
            if (change.type === 'added') {
                addCandidate(change.doc.data());
            }
        });
    });
}

callBtn.addEventListener('click', () => startCall('audio'));
videoBtn.addEventListener('click', () => startCall('video'));

async function answerCall(callId, callData) {
    const type = callData.type || 'audio';
    currentCallType = type;
    setCallScreenMode(type);

    callWithName.textContent = callData.from;
    callAvatar.textContent = callData.from[0].toUpperCase();
    callStatus.textContent = 'Connecting…';
    callScreen.classList.remove('hidden');

    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: type === 'video'
        });
    } catch (err) {
        alert(`Could not access your ${type === 'video' ? 'camera/microphone' : 'microphone'}. Check permissions and try again.`);
        callScreen.classList.add('hidden');
        await updateDoc(doc(db, 'calls', callId), { status: 'ended' });
        return;
    }

    if (type === 'video') {
        localVideo.srcObject = localStream;
    }

    peerConnection = new RTCPeerConnection(rtcConfig);
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    peerConnection.ontrack = (event) => {
        if (type === 'video') {
            remoteVideo.srcObject = event.streams[0];
        } else {
            remoteAudio.srcObject = event.streams[0];
        }
    };

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            addDoc(collection(db, 'calls', callId, 'calleeCandidates'), event.candidate.toJSON());
        }
    };

    await peerConnection.setRemoteDescription(new RTCSessionDescription(callData.offer));
    flushPendingCandidates();

    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    const callDocRef = doc(db, 'calls', callId);
    await updateDoc(callDocRef, {
        answer: { type: answer.type, sdp: answer.sdp },
        status: 'active'
    });

    callStatus.textContent = 'Connected';

    currentCallDocUnsub = onSnapshot(callDocRef, (snap) => {
        const data = snap.data();
        if (data && data.status === 'ended') {
            endCall();
        }
    });

    candidatesUnsub = onSnapshot(collection(db, 'calls', callId, 'callerCandidates'), (snapshot) => {
        snapshot.docChanges().forEach(change => {
            if (change.type === 'added') {
                addCandidate(change.doc.data());
            }
        });
    });
}

function setCallScreenMode(type) {
    callScreen.classList.toggle('video-mode', type === 'video');
}

function addCandidate(candidateData) {
    if (peerConnection && peerConnection.currentRemoteDescription) {
        peerConnection.addIceCandidate(new RTCIceCandidate(candidateData));
    } else {
        pendingCandidates.push(candidateData);
    }
}

function flushPendingCandidates() {
    pendingCandidates.forEach(c => peerConnection.addIceCandidate(new RTCIceCandidate(c)));
    pendingCandidates = [];
}

muteBtn.addEventListener('click', () => {
    if (!localStream) return;
    const audioTrack = localStream.getAudioTracks()[0];
    audioTrack.enabled = !audioTrack.enabled;
    muteBtn.classList.toggle('active', !audioTrack.enabled);
    muteBtn.textContent = audioTrack.enabled ? 'MUTE' : 'UNMUTE';
});

cameraBtn.addEventListener('click', () => {
    if (!localStream) return;
    const videoTrack = localStream.getVideoTracks()[0];
    if (!videoTrack) return;
    videoTrack.enabled = !videoTrack.enabled;
    cameraBtn.classList.toggle('active', !videoTrack.enabled);
    cameraBtn.textContent = videoTrack.enabled ? 'CAM' : 'CAM OFF';
});

hangupBtn.addEventListener('click', async () => {
    if (currentCallId) {
        await updateDoc(doc(db, 'calls', currentCallId), { status: 'ended' });
    }
    endCall();
});

function endCall() {
    stopRingtone();
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    if (currentCallDocUnsub) { currentCallDocUnsub(); currentCallDocUnsub = null; }
    if (candidatesUnsub) { candidatesUnsub(); candidatesUnsub = null; }

    pendingCandidates = [];
    currentCallId = null;
    localVideo.srcObject = null;
    remoteVideo.srcObject = null;
    muteBtn.textContent = 'MUTE';
    muteBtn.classList.remove('active');
    cameraBtn.textContent = 'CAM';
    cameraBtn.classList.remove('active');
    callScreen.classList.add('hidden');
}


if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('service-worker.js').catch(console.error);
    });
}