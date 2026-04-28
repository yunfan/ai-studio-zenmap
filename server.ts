import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import Database from "better-sqlite3";
import { ulid } from "ulid";
import bcrypt from "bcryptjs";

// Initialize SQLite Database
const db = new Database("database.sqlite", { verbose: console.log });
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS maps (
    id TEXT PRIMARY KEY,
    parentId TEXT,
    data TEXT,
    passwordHash TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "10mb" }));

  // API Routes

  // Save map (create new version)
  app.post("/api/maps", async (req, res) => {
    try {
      const { data, parentId, password } = req.body;
      const id = ulid();

      let passwordHash = null;
      if (password) {
        const salt = await bcrypt.genSalt(10);
        passwordHash = await bcrypt.hash(password, salt);
      }

      const stmt = db.prepare(
        "INSERT INTO maps (id, parentId, data, passwordHash) VALUES (?, ?, ?, ?)"
      );
      stmt.run(id, parentId || null, data, passwordHash);

      res.json({ id });
    } catch (err: any) {
      console.error('Save error:', err);
      res.status(500).json({ error: err.message, stack: err.stack, sql: "INSERT" });
    }
  });

  // Get map metadata (check if password is required)
  app.get("/api/maps/:id/meta", (req, res) => {
    try {
      const { id } = req.params;
      const stmt = db.prepare("SELECT passwordHash FROM maps WHERE id = ?");
      const map = stmt.get(id) as { passwordHash: string | null } | undefined;

      if (!map) {
        return res.status(404).json({ error: "Map not found" });
      }

      res.json({ requiresPassword: !!map.passwordHash });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Load map (verify password if needed)
  app.post("/api/maps/:id/load", async (req, res) => {
    try {
      const { id } = req.params;
      const { password } = req.body;

      const stmt = db.prepare("SELECT data, passwordHash FROM maps WHERE id = ?");
      const map = stmt.get(id) as { data: string; passwordHash: string | null } | undefined;

      if (!map) {
        return res.status(404).json({ error: "Map not found" });
      }

      if (map.passwordHash) {
        if (!password) {
          return res.status(401).json({ error: "Password required" });
        }
        const isMatch = await bcrypt.compare(password, map.passwordHash);
        if (!isMatch) {
          return res.status(401).json({ error: "Incorrect password" });
        }
      }

      res.json({ data: map.data, id });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });


  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    // For React Router fallback
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
