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
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      status: "Erreur",
      message: "Email et mot de passe obligatoires"
    });
  }

  try {
    const result = await pool.query(
      "SELECT id, name, email, password, created_at FROM users WHERE email = $1",
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        status: "Erreur",
        message: "Email ou mot de passe incorrect"
      });
    }

    const user = result.rows[0];
    const passwordValid = await bcrypt.compare(password, user.password);

    if (!passwordValid) {
      return res.status(401).json({
        status: "Erreur",
        message: "Email ou mot de passe incorrect"
      });
    }

    res.json({
      status: "Connexion réussie",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        created_at: user.created_at
      }
    });
  } catch (error) {
    res.status(500).json({
      status: "Erreur serveur",
      message: error.message
    });
  }
});
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`AgriPay backend démarré sur le port ${PORT}`);
});
