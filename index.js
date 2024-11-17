const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const admin = require('firebase-admin');

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(cors());

// Firebase initialization (credentials are set in Vercel's environment variables)
const serviceAccount = {
  type: 'service_account',
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: 'https://accounts.google.com/o/oauth2/auth',
  token_uri: 'https://oauth2.googleapis.com/token',
  auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
  client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL,
};

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DATABASE_URL
  });
}

const db = admin.database();

// Basic route to confirm server is running
app.get('/', (req, res) => {
  res.send('Welcome to the chat server!');
});

// Update User Status (Online/Offline)
app.post('/api/user-status', async (req, res) => {
  const { phoneNumber, status } = req.body;

  if (!phoneNumber || !status) {
    return res.status(400).send('Phone number and status are required');
  }

  try {
    const userRef = db.ref('Users').child(phoneNumber);

    if (status === 'online') {
      await userRef.update({
        onlineStatus: 'online',
        lastSeen: null,
      });

      userRef.onDisconnect().update({
        onlineStatus: 'offline',
        lastSeen: admin.database.ServerValue.TIMESTAMP,
      });

      res.status(200).send('User is online');
    } else if (status === 'offline') {
      await userRef.update({
        onlineStatus: 'offline',
        lastSeen: admin.database.ServerValue.TIMESTAMP,
      });
      res.status(200).send('User is offline');
    } else {
      return res.status(400).send('Invalid status');
    }
  } catch (error) {
    console.error('Error updating user status:', error);
    res.status(500).send('Error updating user status');
  }
});

// Message route to send messages
app.post('/api/messages', async (req, res) => {
  const { to, from, message } = req.body;

  if (!to || !from || !message) {
    return res.status(400).send('To, from, and message fields are required');
  }

  try {
    const fromRef = db.ref('Users').child(from).child('messages');
    const toRef = db.ref('Users').child(to).child('messages');

    const newMessageRefFrom = fromRef.push();
    const newMessageRefTo = toRef.push();

    const messageData = {
      to: to,
      from: from,
      message: message,
      timestamp: new Date().toISOString(),
    };

    await newMessageRefFrom.set(messageData);
    await newMessageRefTo.set(messageData);

    res.status(201).send('Message sent successfully');
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).send('Error sending message');
  }
});

// Endpoint to fetch messages for a specific user
app.get('/api/messages/:phoneNumber', async (req, res) => {
  const { phoneNumber } = req.params;

  if (!phoneNumber) {
    return res.status(400).send('Phone number is required');
  }

  try {
    const userMessagesRef = db.ref('Users').child(phoneNumber).child('messages');

    const snapshot = await userMessagesRef.once('value');
    const messages = [];

    snapshot.forEach((childSnapshot) => {
      messages.push({ id: childSnapshot.key, ...childSnapshot.val() });
    });

    if (messages.length === 0) {
      return res.status(404).send('No messages found for this user');
    }

    res.status(200).json(messages);
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).send('Error fetching messages');
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
