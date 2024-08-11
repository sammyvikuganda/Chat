const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;

// Middleware to parse JSON bodies
app.use(express.json());

// Configure CORS
const corsHandler = cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
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
    databaseURL: process.env.FIREBASE_DATABASE_URL,
    storageBucket: process.env.FIREBASE_BUCKET_NAME
  });
}

const db = admin.database();
const bucket = admin.storage().bucket(process.env.FIREBASE_BUCKET_NAME);

// Configure Multer for file uploads
const multerStorage = multer.memoryStorage();
const upload = multer({ storage: multerStorage });

// Basic route to confirm server is running
app.get('/', (req, res) => {
  res.send('Welcome to the chat server!');
});

// API route for handling messages
app.use('/api/messages', (req, res) => {
  corsHandler(req, res, async () => {
    if (req.method === 'GET') {
      const userId = req.query.userId;
      if (!userId) {
        try {
          const usersRef = db.ref('Users');
          const snapshot = await usersRef.once('value');
          const users = [];
          snapshot.forEach(userSnapshot => {
            const userId = userSnapshot.key;
            const userMessages = [];
            userSnapshot.forEach(messageSnapshot => {
              userMessages.push({ id: messageSnapshot.key, ...messageSnapshot.val() });
            });
            users.push({ userId, messages: userMessages });
          });
          res.status(200).json(users);
        } catch (error) {
          console.error('Error fetching messages:', error);
          res.status(500).send('Error fetching messages');
        }
      } else {
        try {
          const messagesRef = db.ref(`Users/${userId}`);
          const snapshot = await messagesRef.once('value');
          const messages = [];
          snapshot.forEach(childSnapshot => {
            messages.push({ id: childSnapshot.key, ...childSnapshot.val() });
          });
          res.status(200).json(messages);
        } catch (error) {
          console.error('Error fetching messages:', error);
          res.status(500).send('Error fetching messages');
        }
      }
    } else if (req.method === 'POST') {
      const { sender, text, replyTo, imageUrl } = req.body;
      const userId = req.query.userId;
      if (!userId) {
        return res.status(400).send('User ID is required');
      }

      const messagesRef = db.ref(`Users/${userId}`);
      
      try {
        if (replyTo) {
          const messageRef = messagesRef.child(replyTo);
          const messageSnapshot = await messageRef.once('value');
          if (messageSnapshot.exists()) {
            await messageRef.child('replies').push({
              sender: sender,
              text: text,
              imageUrl: imageUrl,
              timestamp: new Date().toISOString()
            });
            res.status(200).send('Reply sent');
          } else {
            res.status(404).send('Message to reply to not found');
          }
        } else {
          const newMessageRef = messagesRef.push();
          await newMessageRef.set({
            sender: sender,
            text: text,
            imageUrl: imageUrl,
            timestamp: new Date().toISOString(),
            replies: {}
          });
          res.status(200).send('Message sent');
        }
      } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).send('Error sending message: ' + error.message);
      }
    } else {
      res.setHeader('Allow', ['GET', 'POST']);
      res.status(405).end(`Method ${req.method} Not Allowed`);
    }
  });
});

// API route for uploading images
app.post('/api/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).send('No file uploaded');
  }

  try {
    const blob = bucket.file(req.file.originalname);
    const blobStream = blob.createWriteStream({
      metadata: {
        contentType: req.file.mimetype
      }
    });

    blobStream.on('error', (err) => {
      console.error('Error uploading file:', err);
      res.status(500).send('Error uploading file');
    });

    blobStream.on('finish', async () => {
      const url = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;
      res.status(200).json({ imageUrl: url });
    });

    blobStream.end(req.file.buffer);
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).send('Error uploading file');
  }
});

// Start the server (for local testing)
if (require.main === module) {
  app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
}

// Export the Express app
module.exports = app;
