const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
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
app.post("/register", async (req, res) => {
    const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({
      status: "Erreur",
      message: "Nom, email et mot de passe obligatoires"
    });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 12);
    const result = await pool.query(
      "INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING id, name, email, created_at",
      [name, email, hashedPassword]
    );

    res.status(201).json({
      status: "Inscription réussie",
      user: result.rows[0]
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        status: "Erreur",
        message: "Cet email est déjà utilisé"
      });
    }

    res.status(500).json({
      status: "Erreur serveur",
      message: error.message
    });
  }
});
app.get("/register-test", async (req, res) => {
  try {
    const email = `test${Date.now()}@agripay.test`;
    const password = "TestAgripay123";
    const hashedPassword = await bcrypt.hash(password, 12);

    const result = await pool.query(
      "INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING id, name, email, created_at",
      ["Test AgriPay", email, hashedPassword]
    );

    res.status(201).json({
      status: "Test inscription réussi",
      user: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({
      status: "Erreur test inscription",
      error: error.message
    });
  }
});
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`AgriPay backend démarré sur le port ${PORT}`);
});
