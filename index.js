const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 3000;

// Middleware to parse JSON bodies
app.use(express.json());

// Use the default CORS configuration (allows all origins and basic methods)
app.use(cors());

// Initialize Firebase Admin SDK with environment variables
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

// Registration route for new users
app.post('/api/register', async (req, res) => {
  const { phoneNumber, password } = req.body;

  if (!phoneNumber || !password) {
    return res.status(400).send('Phone number and password are required');
  }

  // Validate phone number format (you can enhance this)
  const phoneNumberRegex = /^[0-9]{10}$/;
  if (!phoneNumberRegex.test(phoneNumber)) {
    return res.status(400).send('Invalid phone number format');
  }

  try {
    // Check if the user already exists
    const userRef = db.ref('Users').child(phoneNumber);
    const snapshot = await userRef.once('value');
    
    if (snapshot.exists()) {
      return res.status(400).send('User already exists');
    }

    // Store user in the database
    await userRef.set({
      phoneNumber: phoneNumber,
      password: password, // Storing plain password (not recommended)
      onlineStatus: 'offline',
      lastSeen: null
    });

    res.status(201).send('User registered successfully');
  } catch (error) {
    console.error('Error registering user:', error);
    res.status(500).send('Error registering user');
  }
});

// Login route for existing users
app.post('/api/login', async (req, res) => {
  const { phoneNumber, password } = req.body;

  if (!phoneNumber || !password) {
    return res.status(400).send('Phone number and password are required');
  }

  try {
    const userRef = db.ref('Users').child(phoneNumber);
    const snapshot = await userRef.once('value');

    if (!snapshot.exists()) {
      return res.status(404).send('User not found');
    }

    const user = snapshot.val();
    if (user.password !== password) {
      return res.status(401).send('Invalid password');
    }

    res.status(200).send('Login successful');
  } catch (error) {
    console.error('Error logging in user:', error);
    res.status(500).send('Error logging in user');
  }
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
      // Set user to online and update the timestamp for last seen when they go offline
      await userRef.update({
        onlineStatus: 'online',
        lastSeen: null,  // Don't set last seen while online
      });

      // Automatically set the status to offline when the user disconnects
      userRef.onDisconnect().update({
        onlineStatus: 'offline',
        lastSeen: admin.database.ServerValue.TIMESTAMP,
      });

      res.status(200).send('User is online');
    } else if (status === 'offline') {
      // Manually set the status to offline and last seen time
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
    // Store message under the "messages" node for the sending user (from) and receiving user (to)
    const fromRef = db.ref('Users').child(from).child('messages');
    const toRef = db.ref('Users').child(to).child('messages');

    const newMessageRefFrom = fromRef.push();
    const newMessageRefTo = toRef.push();

    const messageData = {
      to: to,
      from: from,
      message: message,
      timestamp: new Date().toISOString(), // Timestamp for when the message was sent
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
    // Reference to the user's messages in the database
    const userMessagesRef = db.ref('Users').child(phoneNumber).child('messages');

    // Get all messages for the user
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

// Export the Express app (for serverless environments)
module.exports = app;
