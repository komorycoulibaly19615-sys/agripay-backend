const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
require("dotenv").config();

const app = express();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    message: "Bienvenue sur le backend AgriPay 🌱",
    status: "API opérationnelle"
  });
});
app.get("/db-test", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json({
      status: "PostgreSQL connecté",
      time: result.rows[0].now
        });
    } catch (error) {
    res.status(500).json({
      status: "Erreur PostgreSQL"
        });
    }
  });
async function createUsersTable() {
  try {
    await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    `);
    } catch (error) {
    console.error("Erreur création table users:", error);
    }
  }
createUsersTable();
app.get("/users-test", async (req, res) => {
  try {
    const result = await pool.query("SELECT id, name, email, created_at FROM users");
    res.json({
      status: "Table users opérationnelle",
      users: result.rows
    });
  } catch (error) {
    res.status(500).json({
      status: "Erreur table users",
      error: error.message
    });
  }
});
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`AgriPay backend démarré sur le port ${PORT}`);
});
