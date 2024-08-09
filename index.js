const express = require('express');
const { initializeApp } = require('firebase/app');
const { getDatabase, ref, onValue, push } = require('firebase/database');
const cors = require('cors');

// Initialize Express app
const app = express();
app.use(cors());
app.use(express.json());

// Firebase configuration from environment variables
const firebaseConfig = {
  type: process.env.FIREBASE_TYPE,
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: process.env.FIREBASE_AUTH_URI,
  token_uri: process.env.FIREBASE_TOKEN_URI,
  auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL,
  client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL,
  databaseURL: 'https://chat-aac94-default-rtdb.firebaseio.com'
};

// Initialize Firebase
const firebaseApp = initializeApp(firebaseConfig);
const database = getDatabase(firebaseApp);

// API endpoint to get messages
app.get('/messages', (req, res) => {
  const messagesRef = ref(database, 'chats/chatId1');
  onValue(messagesRef, (snapshot) => {
    const messages = [];
    snapshot.forEach(childSnapshot => {
      messages.push(childSnapshot.val());
    });
    res.json(messages);
  }, {
    onlyOnce: true // Fetch messages only once
  });
});

// API endpoint to send a message
app.post('/messages', (req, res) => {
  const { sender, text } = req.body;
  const messagesRef = ref(database, 'chats/chatId1');
  const newMessageRef = push(messagesRef);
  newMessageRef.set({
    sender: sender,
    text: text,
    timestamp: new Date().toISOString()
  }).then(() => {
    res.status(200).send('Message sent');
  }).catch(error => {
    res.status(500).send(error.message);
  });
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
