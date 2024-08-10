const express = require('express');
const { initializeApp } = require('firebase/app');
const { getDatabase, ref, onValue, push } = require('firebase/database');
const cors = require('cors');

const app = express();
app.use(cors()); // Enable CORS
app.use(express.json());

// Firebase configuration
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.FIREBASE_DATABASE_URL,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
  measurementId: process.env.FIREBASE_MEASUREMENT_ID
};

// Initialize Firebase
const firebaseApp = initializeApp(firebaseConfig);
const database = getDatabase(firebaseApp);

// Basic route to confirm server is running
app.get('/', (req, res) => {
  res.send('Welcome to the chat server!');
});

// Fetch messages
app.get('/messages', (req, res) => {
  const messagesRef = ref(database, 'chats/chatId1');
  onValue(messagesRef, (snapshot) => {
    const messages = [];
    snapshot.forEach(childSnapshot => {
      messages.push(childSnapshot.val());
    });
    res.json(messages);
  }, {
    onlyOnce: true
  });
});

// Send a new message
app.post('/messages', (req, res) => {
  const { sender, text } = req.body;
  console.log('Received data:', { sender, text });

  if (!sender || !text) {
    return res.status(400).send('Sender and text are required');
  }

  const messagesRef = ref(database, 'chats/chatId1');
  const newMessageRef = push(messagesRef);
  newMessageRef.set({
    sender: sender,
    text: text,
    timestamp: new Date().toISOString()
  }).then(() => {
    res.status(200).send('Message sent');
  }).catch(error => {
    console.error('Error sending message:', error);
    res.status(500).send('Error sending message');
  });
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
