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
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`AgriPay backend démarré sur le port ${PORT}`);
});
