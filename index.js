const express = require('express');
const { initializeApp } = require('firebase/app');
const { getDatabase, ref, onValue, push } = require('firebase/database');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const firebaseConfig = {
  // Firebase configuration
};

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

