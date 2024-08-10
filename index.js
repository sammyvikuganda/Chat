const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 3000;

// Middleware to parse JSON bodies
app.use(express.json());

// Configure CORS
const corsHandler = cors({
  origin: '*',
  methods: ['GET', 'POST'],
});

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

// API route for handling messages
app.use('/api/messages', (req, res) => {
  corsHandler(req, res, async () => {
    const { userId } = req.query || req.body;

    if (!userId) {
      return res.status(400).send('User ID is required');
    }

    const userRef = db.ref(`Users/${userId}`);

    if (req.method === 'GET') {
      // Fetch messages
      try {
        const snapshot = await userRef.once('value');
        const messages = snapshot.val() || {};
        res.status(200).json(messages);
      } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).send('Error fetching messages');
      }
    } else if (req.method === 'POST') {
      // Send a new message or reply
      const { sender, text, replyTo } = req.body;

      if (!sender || !text) {
        return res.status(400).send('Sender and text are required');
      }

      try {
        // Determine if it's a client message or an admin reply
        const messageType = sender === 'Marvin' ? 'reply' : 'message';
        const messageTypeRef = userRef.child(messageType + 'Count');

        // Get the current count for the message type
        const countSnapshot = await messageTypeRef.once('value');
        const currentCount = countSnapshot.val() || 0;

        // Increment the count
        await messageTypeRef.set(currentCount + 1);

        // Store the message with text, timestamp, and type
        const messageRef = userRef.child(`${messageType}${currentCount + 1}`);
        await messageRef.set({
          text: text,
          timestamp: new Date().toISOString(),
          type: sender === 'Marvin' ? 'admin' : 'client'
        });

        res.status(200).send('Message sent');
      } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).send('Error sending message');
      }
    } else {
      res.setHeader('Allow', ['GET', 'POST']);
      res.status(405).end(`Method ${req.method} Not Allowed`);
    }
  });
});

// Start the server (for local testing)
if (require.main === module) {
  app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
}

// Export the Express app
module.exports = app;
