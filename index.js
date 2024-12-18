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

    // Generate a fixed messageId for both sender and receiver
    const messageId = `EYENET${Date.now()}`;

    const messageData = {
      messageId, // Add the consistent message ID
      to: to,
      from: from,
      message: message || '',  // If no message, set it to an empty string
      timestamp: new Date().toISOString(),
      imageUrl: imageUrl || null,  // Include the image URL if available
    };

    // Store the message in both sender's and recipient's records using the same ID
    await fromRef.child('messages').child(messageId).set(messageData);
    await toRef.child('messages').child(messageId).set(messageData);

    res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      messageId, // Return the consistent message ID to the client
    });
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



// Endpoint to upload a profile picture
app.post('/api/users/upload-profile-picture', upload.single('profilePicture'), async (req, res) => {
  const { phoneNumber } = req.body;

  if (!phoneNumber || !req.file) {
    return res.status(400).send('Phone number and profile picture are required');
  }

  try {
    const userRef = db.ref('Users').child(phoneNumber);

    // Check if the user exists
    const snapshot = await userRef.once('value');
    if (!snapshot.exists()) {
      return res.status(404).send('User not found');
    }

    // Upload the profile picture to Firebase Storage
    const imageUrl = await uploadImage(req.file);

    // Update the user's record with the profile picture URL
    await userRef.update({ profilePicture: imageUrl });

    res.status(200).json({
      success: true,
      message: 'Profile picture updated successfully',
      imageUrl,
    });
  } catch (error) {
    console.error('Error uploading profile picture:', error);
    res.status(500).send('Error uploading profile picture');
  }
});



// Endpoint to fetch user details including profile picture
app.get('/api/users/:phoneNumber', async (req, res) => {
  const { phoneNumber } = req.params;

  if (!phoneNumber) {
    return res.status(400).send('Phone number is required');
  }

  try {
    const userRef = db.ref('Users').child(phoneNumber);

    // Fetch user details
    const snapshot = await userRef.once('value');

    if (!snapshot.exists()) {
      return res.status(404).send('User not found');
    }

    const userData = snapshot.val();

    res.status(200).json({
      success: true,
      user: {
        phoneNumber: userData.phoneNumber,
        profilePicture: userData.profilePicture || null,
        onlineStatus: userData.onlineStatus || 'offline',
        lastSeen: userData.lastSeen || null,
      },
    });
  } catch (error) {
    console.error('Error fetching user details:', error);
    res.status(500).send('Error fetching user details');
  }
});




// Endpoint to delete a message for both users
app.post('/api/messages/delete', async (req, res) => {
  const { messageId, to, from } = req.body;

  if (!messageId || !to || !from) {
    return res.status(400).send('Message ID, to, and from fields are required');
  }

  try {
    // Get the references for both sender and recipient message histories
    const fromRef = db.ref('Users').child(from).child('messages');
    const toRef = db.ref('Users').child(to).child('messages');

    // Fetch the sender's messages and find the specific message
    const fromSnapshot = await fromRef.once('value');
    let messageFound = false;

    fromSnapshot.forEach((childSnapshot) => {
      if (childSnapshot.key === messageId) {
        // Update the message to indicate it was deleted
        fromRef.child(messageId).update({
          message: 'This message was deleted',
          timestamp: new Date().toISOString(),  // Optional: Update timestamp
        });
        messageFound = true;
      }
    });

    if (!messageFound) {
      return res.status(404).send('Message not found in sender\'s chat');
    }

    // Fetch the recipient's messages and find the same message
    const toSnapshot = await toRef.once('value');
    messageFound = false;

    toSnapshot.forEach((childSnapshot) => {
      if (childSnapshot.key === messageId) {
        // Update the message to indicate it was deleted
        toRef.child(messageId).update({
          message: 'This message was deleted',
          timestamp: new Date().toISOString(),  // Optional: Update timestamp
        });
        messageFound = true;
      }
    });

    if (!messageFound) {
      return res.status(404).send('Message not found in recipient\'s chat');
    }

    res.status(200).send('Message deleted for both users');
  } catch (error) {
    console.error('Error deleting message:', error);
    res.status(500).send('Error deleting message');
  }
});



// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
