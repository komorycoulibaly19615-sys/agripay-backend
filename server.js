const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { body, validationResult } = require("express-validator");
const winston = require("winston");
require("dotenv").config();

// ==================== LOGGER ====================
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: "agripay-backend" },
  transports: [
    new winston.transports.File({ filename: "logs/error.log", level: "error" }),
    new winston.transports.File({ filename: "logs/combined.log" }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// ==================== DATABASE ====================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
});

pool.on("error", (err) => {
  logger.error("Erreur connexion pool PostgreSQL:", err);
});

// ==================== EXPRESS CONFIG ====================
const app = express();

// CORS - restreint aux origines autorisées
const corsOptions = {
  origin: (process.env.ALLOWED_ORIGINS || "http://localhost:3000").split(","),
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==================== MIDDLEWARE ====================

// Middleware d'authentification JWT
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // "Bearer TOKEN"

  if (!token) {
    logger.warn("Tentative d'accès sans token");
    return res.status(401).json({
      status: "Erreur",
      message: "Token manquant"
    });
  }

  jwt.verify(token, process.env.JWT_SECRET || "your-secret-key", (err, user) => {
    if (err) {
      logger.warn(`Token invalide: ${err.message}`);
      return res.status(403).json({
        status: "Erreur",
        message: "Token invalide ou expiré"
      });
    }

    req.user = user;
    next();
  });
};

// Middleware de gestion des erreurs globales
const errorHandler = (err, req, res, next) => {
  logger.error("Erreur non gérée:", err);
  
  res.status(err.status || 500).json({
    status: "Erreur serveur",
    message: process.env.NODE_ENV === "production" 
      ? "Une erreur interne s'est produite" 
      : err.message
  });
};

// ==================== INITIALISATION DB ====================
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
      
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    `);
    logger.info("Table users vérifiée/créée avec succès");
  } catch (error) {
    logger.error("Erreur création table users:", error);
    process.exit(1);
  }
}

// ==================== ROUTES ====================

// Route publique de santé
app.get("/", (req, res) => {
  res.json({
    message: "Bienvenue sur le backend AgriPay 🌱",
    status: "API opérationnelle",
    version: "2.0"
  });
});

// Route de test PostgreSQL
app.get("/db-test", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    logger.info("Test DB réussi");
    res.json({
      status: "PostgreSQL connecté",
      time: result.rows[0].now
    });
  } catch (error) {
    logger.error("Erreur test DB:", error);
    res.status(500).json({
      status: "Erreur PostgreSQL",
      message: error.message
    });
  }
});

// Route protégée - Lister tous les utilisateurs (admin only)
app.get("/users-test", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, name, email, created_at FROM users ORDER BY created_at DESC"
    );
    logger.info(`Utilisateur ${req.user.id} a consulté la liste des users`);
    res.json({
      status: "Table users opérationnelle",
      count: result.rows.length,
      users: result.rows
    });
  } catch (error) {
    logger.error("Erreur lecture table users:", error);
    res.status(500).json({
      status: "Erreur table users",
      message: error.message
    });
  }
});

// Route REGISTER
app.post("/register",
  // Validation des inputs
  body("name")
    .trim()
    .notEmpty().withMessage("Le nom est obligatoire")
    .isLength({ min: 2, max: 100 }).withMessage("Le nom doit avoir entre 2 et 100 caractères")
    .matches(/^[a-zA-Z\s'-]+$/).withMessage("Le nom contient des caractères invalides"),
  
  body("email")
    .trim()
    .isEmail().withMessage("Email invalide")
    .normalizeEmail(),
  
  body("password")
    .isLength({ min: 8 }).withMessage("Le mot de passe doit avoir au moins 8 caractères")
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage("Le mot de passe doit contenir au moins une majuscule, une minuscule et un chiffre"),
  
  async (req, res) => {
    // Vérifier les erreurs de validation
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn("Erreurs validation register:", errors.array());
      return res.status(400).json({
        status: "Erreur validation",
        errors: errors.array().map(e => ({ field: e.param, message: e.msg }))
      });
    }

    const { name, email, password } = req.body;

    try {
      const hashedPassword = await bcrypt.hash(password, 12);
      const result = await pool.query(
        "INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING id, name, email, created_at",
        [name, email, hashedPassword]
      );

      const user = result.rows[0];
      logger.info(`Nouvel utilisateur inscrit: ${user.email}`);

      // Générer JWT
      const token = jwt.sign(
        { id: user.id, email: user.email, name: user.name },
        process.env.JWT_SECRET || "your-secret-key",
        { expiresIn: "24h" }
      );

      res.status(201).json({
        status: "Inscription réussie",
        message: "Vous êtes maintenant connecté",
        token,
        user
      });
    } catch (error) {
      if (error.code === "23505") {
        logger.warn(`Email déjà utilisé: ${email}`);
        return res.status(409).json({
          status: "Erreur",
          message: "Cet email est déjà utilisé"
        });
      }

      logger.error("Erreur register:", error);
      res.status(500).json({
        status: "Erreur serveur",
        message: "Impossible de créer le compte"
      });
    }
  }
);

// Route LOGIN
app.post("/login",
  // Validation des inputs
  body("email")
    .trim()
    .isEmail().withMessage("Email invalide")
    .normalizeEmail(),
  
  body("password")
    .notEmpty().withMessage("Le mot de passe est obligatoire"),
  
  async (req, res) => {
    // Vérifier les erreurs de validation
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn("Erreurs validation login:", errors.array());
      return res.status(400).json({
        status: "Erreur validation",
        errors: errors.array().map(e => ({ field: e.param, message: e.msg }))
      });
    }

    const { email, password } = req.body;

    try {
      const result = await pool.query(
        "SELECT id, name, email, password, created_at FROM users WHERE email = $1",
        [email]
      );

      if (result.rows.length === 0) {
        logger.warn(`Tentative login avec email inexistant: ${email}`);
        return res.status(401).json({
          status: "Erreur authentification",
          message: "Les identifiants sont incorrects"
        });
      }

      const user = result.rows[0];
      const passwordValid = await bcrypt.compare(password, user.password);

      if (!passwordValid) {
        logger.warn(`Tentative login avec mauvais mot de passe: ${email}`);
        return res.status(401).json({
          status: "Erreur authentification",
          message: "Les identifiants sont incorrects"
        });
      }

      // Générer JWT
      const token = jwt.sign(
        { id: user.id, email: user.email, name: user.name },
        process.env.JWT_SECRET || "your-secret-key",
        { expiresIn: "24h" }
      );

      logger.info(`Connexion réussie: ${email}`);

      res.json({
        status: "Connexion réussie",
        message: "Vous êtes connecté",
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          created_at: user.created_at
        }
      });
    } catch (error) {
      logger.error("Erreur login:", error);
      res.status(500).json({
        status: "Erreur serveur",
        message: "Impossible de traiter la connexion"
      });
    }
  }
);

// Route protégée - Récupérer les infos de l'utilisateur connecté
app.get("/me", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, name, email, created_at FROM users WHERE id = $1",
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        status: "Erreur",
        message: "Utilisateur non trouvé"
      });
    }

    res.json({
      status: "Succès",
      user: result.rows[0]
    });
  } catch (error) {
    logger.error("Erreur récupération utilisateur:", error);
    res.status(500).json({
      status: "Erreur serveur",
      message: "Impossible de récupérer les informations"
    });
  }
});

// ==================== STARTUP ====================
const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    // Vérifier les variables d'environnement essentielles
    if (!process.env.DATABASE_URL) {
      logger.error("DATABASE_URL non défini");
      process.exit(1);
    }

    if (!process.env.JWT_SECRET && process.env.NODE_ENV === "production") {
      logger.error("JWT_SECRET non défini en production");
      process.exit(1);
    }

    // Créer les tables
    await createUsersTable();

    // Démarrer le serveur
    const server = app.listen(PORT, () => {
      logger.info(`AgriPay backend démarré sur le port ${PORT}`);
    });

    // Fermeture gracieuse
    process.on("SIGTERM", async () => {
      logger.info("SIGTERM reçu, fermeture gracieuse...");
      server.close(async () => {
        await pool.end();
        logger.info("Pool PostgreSQL fermée");
        process.exit(0);
      });
    });

    process.on("SIGINT", async () => {
      logger.info("SIGINT reçu, fermeture gracieuse...");
      server.close(async () => {
        await pool.end();
        logger.info("Pool PostgreSQL fermée");
        process.exit(0);
      });
    });

  } catch (error) {
    logger.error("Erreur au démarrage du serveur:", error);
    process.exit(1);
  }
}

// Appliquer le middleware d'erreur globale en dernier
app.use(errorHandler);

// Démarrer le serveur
startServer();

module.exports = app;
