const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const admin = require('firebase-admin');
const multer = require('multer');
const path = require('path');

// Initialize the app and set up Firebase
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
    databaseURL: process.env.FIREBASE_DATABASE_URL,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET, // Specify the storage bucket here
  });
}

const db = admin.database();
const bucket = admin.storage().bucket();

// Configure multer for file upload
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Basic route to confirm server is running
app.get('/', (req, res) => {
  res.send('Welcome to the chat server!');
});

// Function to upload an image to Firebase Storage
async function uploadImage(file) {
  const fileName = `${Date.now()}_${file.originalname}`;
  const fileUpload = bucket.file(fileName);

  try {
    await fileUpload.save(file.buffer, {
      contentType: file.mimetype,
    });

    // Get the public URL of the uploaded image
    const imageUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(fileName)}?alt=media`;
    return imageUrl;
  } catch (error) {
    console.error('Error uploading image:', error);
    throw new Error('Error uploading image');
  }
}

// Endpoint to create a new user
app.post('/api/users', async (req, res) => {
  const { phoneNumber, password } = req.body;

  if (!phoneNumber || !password) {
    return res.status(400).send('Phone number and password are required');
  }

  try {
    const userRef = db.ref('Users').child(phoneNumber);

    // Check if the user already exists
    const snapshot = await userRef.once('value');
    if (snapshot.exists()) {
      return res.status(400).send('User already exists');
    }

    // Create new user
    await userRef.set({
      phoneNumber,
      password,
    });

    res.status(201).send('User created successfully');
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).send('Error creating user');
  }
});

// Login User
app.post('/api/login', async (req, res) => {
  const { phoneNumber, password } = req.body;

  if (!phoneNumber || !password) {
    return res.status(400).send('Phone number and password are required');
  }

  try {
    const userRef = db.ref('Users').child(phoneNumber);

    // Check if the user exists
    const snapshot = await userRef.once('value');
    if (!snapshot.exists()) {
      return res.status(404).send('User not found');
    }

    const userData = snapshot.val();

    // Verify password (as stored in plaintext in this case)
    if (userData.password === password) {
      return res.status(200).json({
        success: true,
        phoneNumber: userData.phoneNumber,
      });
    } else {
      return res.status(401).send('Invalid credentials');
    }
  } catch (error) {
    console.error('Error verifying login:', error);
    res.status(500).send('Error verifying login');
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

// Message route to send messages with images
app.post('/api/messages', upload.single('image'), async (req, res) => {
  const { to, from, message } = req.body;

  if (!to || !from) {
    return res.status(400).send('To and from fields are required');
  }

  try {
    // Check if the recipient exists in the database
    const toRef = db.ref('Users').child(to);
    const toSnapshot = await toRef.once('value');

    if (!toSnapshot.exists()) {
      return res.status(404).send('This phone number is not on EyeNet');
    }

    // Check if the sender exists in the database
    const fromRef = db.ref('Users').child(from);
    const fromSnapshot = await fromRef.once('value');

    if (!fromSnapshot.exists()) {
      return res.status(404).send('Sender is not registered');
    }

    // Handle image upload if exists
    let imageUrl = null;
    if (req.file) {
      imageUrl = await uploadImage(req.file);
    }

    // If neither message nor image exists, return an error
    if (!message && !imageUrl) {
      return res.status(400).send('Message or image is required');
    }

    // If both users exist, proceed to send the message
    const newMessageRefFrom = fromRef.child('messages').push();
    const newMessageRefTo = toRef.child('messages').push();

    const messageData = {
      to: to,
      from: from,
      message: message || '',  // If no message, set it to an empty string
      timestamp: new Date().toISOString(),
      imageUrl: imageUrl || null,  // Include the image URL if available
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
  } catch (error)    {
    console.error('Error fetching messages:', error);
    res.status(500).send('Error fetching messages');
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
