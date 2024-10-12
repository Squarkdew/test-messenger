require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const secretKey = process.env.SECRET_KEY;

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 666;

const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
});

app.use(
  cors({
    origin: [
      "https://messengerify-vip.netlify.app",
      "https://test-messenger.onrender.com",
    ],
    methods: ["GET", "POST"],
    credentials: true,
  })
);

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: [
      "https://messengerify-vip.netlify.app",
      "https://test-messenger.onrender.com",
    ],
    methods: ["GET", "POST"],
  },
  transports: ["websocket", "polling"],
});

io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id}`);
  });
});

app.get("/getAllUsers", async (req, res) => {
  try {
    let allUsersQuery = `SELECT * FROM users`;

    const result = await pool.query(allUsersQuery);
    const allUsers = result.rows;

    res.json(
      allUsers.map((el) => ({
        id: el.id,
        login: el.login,
      }))
    );
  } catch (error) {
    res.json(false);
    console.log(error);
  }
});

app.post("/getInvites", async (req, res) => {
  try {
    const { token } = req.body;

    const decoded = jwt.verify(token, secretKey);
    const userId = decoded.id;

    const result = await pool.query(
      `SELECT u.id, u.login
         FROM friend_requests fr
         JOIN users u ON u.id = fr.user_id
         WHERE fr.friend_id = $1 AND fr.status = 'pending'`,
      [userId]
    );

    res.json(result.rows);
  } catch (error) {
    res.json(false);
    console.log(error);
  }
});

app.post("/sendFriendRequest", async (req, res) => {
  try {
    const { friendId, token } = req.body;

    const decoded = jwt.verify(token, secretKey);
    const userId = decoded.id;
    const createdAt = new Date().toISOString();

    await pool.query(
      `INSERT INTO friend_requests (user_id, friend_id, created_at, status) VALUES ($1, $2, $3, 'pending') RETURNING *`,
      [userId, friendId, createdAt]
    );
    res.status(200).json({ success: true });

    io.emit("newFriendRequest");
  } catch (error) {
    res.json(false);
    console.log(error);
  }
});

app.post("/acceptFriendship", async (req, res) => {
  try {
    const { friendId, token } = req.body;

    const decoded = jwt.verify(token, secretKey);
    const userId = decoded.id;

    const createdAt = new Date().toISOString();

    await pool.query(
      `UPDATE friend_requests SET status = 'accepted' WHERE user_id = $1 AND friend_id = $2`,
      [friendId, userId]
    );

    await pool.query(
      `INSERT INTO friends (user_id, friend_id, created_at) VALUES ($1, $2, $3)`,
      [userId, friendId, createdAt]
    );
    await pool.query(
      `INSERT INTO friends (user_id, friend_id, created_at) VALUES ($1, $2, $3)`,
      [friendId, userId, createdAt]
    );

    res.status(200).json({ success: true });

    io.emit("newFriendship");
  } catch (error) {
    res.json(false);
    console.log(error);
  }
});
app.post("/diclineFriendship", async (req, res) => {
  try {
    const { friendId, token } = req.body;

    const decoded = jwt.verify(token, secretKey);
    const userId = decoded.id;

    await pool.query(
      `UPDATE friend_requests SET status = 'declined' WHERE user_id = $1 AND friend_id = $2`,
      [friendId, userId]
    );
    res.status(200).json({ success: true });

    io.emit("newFriendRequest");
  } catch (error) {
    res.json(false);
    console.log(error);
  }
});

app.post("/getFriends", async (req, res) => {
  try {
    const { token } = req.body;

    const decoded = jwt.verify(token, secretKey);
    const userId = decoded.id;

    const result = await pool.query(
      `SELECT DISTINCT u.id, u.login
   FROM friends f
   JOIN users u ON u.id = f.friend_id
   WHERE f.user_id = $1`,
      [userId]
    );
    res.json(result.rows);
  } catch (error) {
    console.log(error);
    res
      .status(500)
      .json({ success: false, error: "Failed to retrieve friends" });
  }
});

app.post("/getMessages", async (req, res) => {
  try {
    const { token } = req.body;

    const decoded = jwt.verify(token, secretKey);
    const userId = decoded.id;

    const result = await pool.query(
      `SELECT m.id, m.sender_id, m.receiver_id, m.message, m.created_at
         FROM messages m
         WHERE (m.sender_id = $1)
         OR (m.receiver_id = $1)
         ORDER BY m.created_at ASC`,
      [userId]
    );

    res.json({ messages: result.rows, currentUserId: userId });
  } catch (error) {
    console.log(error);
    res
      .status(500)
      .json({ success: false, error: "Failed to retrieve friends" });
  }
});

app.post("/sendMessage", async (req, res) => {
  try {
    const { token, friendId, message } = req.body;

    const decoded = jwt.verify(token, secretKey);
    const userId = decoded.id;

    const createdAt = new Date().toISOString();

    await pool.query(
      `INSERT INTO messages (sender_id, receiver_id, message, created_at) VALUES ($1, $2, $3, $4)`,
      [userId, friendId, message, createdAt]
    );

    io.emit("newMessage");

    res.status(200).json({ success: true });
  } catch (error) {
    console.log(error);
    res
      .status(500)
      .json({ success: false, error: "Failed to retrieve friends" });
  }
});

server.listen(PORT, () => {
  console.log(`server has been started on port ${PORT}`);
});
