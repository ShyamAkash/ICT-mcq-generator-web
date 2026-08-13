import express, { Request, Response } from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import cookieParser from "cookie-parser";
import { GoogleGenAI } from "@google/genai";
import JSZip from "jszip";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import multer from "multer";
import dotenv from "dotenv";
import { sql } from "@vercel/postgres";
import { ConvertToLegacy } from "./src/UnicodeToLegacy.js";

dotenv.config();

const ENGLISH_TERM_RE = /[A-Za-z0-9]+(?:[ \-][A-Za-z0-9]+)*/g;

interface TextSegment {
  text: string;
  isEnglish: boolean;
}

// Splits Sinhala text into (Sinhala | English) chunks, converting only the
// Sinhala chunks to the legacy encoding. English acronyms/terms embedded in
// the sentence (GPU, CPU, RAM...) are left as-is so they can be rendered in
// Times New Roman instead of the legacy Sinhala font.
function toLegacySegments(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let pos = 0;
  let m: RegExpExecArray | null;
  ENGLISH_TERM_RE.lastIndex = 0;
  while ((m = ENGLISH_TERM_RE.exec(text)) !== null) {
    if (m.index > pos) {
      segments.push({ text: ConvertToLegacy(text.slice(pos, m.index)), isEnglish: false });
    }
    segments.push({ text: m[0], isEnglish: true });
    pos = m.index + m[0].length;
  }
  if (pos < text.length) {
    segments.push({ text: ConvertToLegacy(text.slice(pos)), isEnglish: false });
  }
  return segments;
}

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(cookieParser());

const PROJECT_ROOT = process.cwd();
app.use("/static", express.static(path.join(PROJECT_ROOT, "static")));
app.use(express.static(PROJECT_ROOT));
const TEMPLATES_DIR = path.join(PROJECT_ROOT, "templates");
const PROMPT_PATH = path.join(PROJECT_ROOT, "prompt.txt");
const PENDING_VOCAB_PATH = path.join(PROJECT_ROOT, "pending_vocab.json");

const TMP_PROMPT_PATH = path.join("/tmp", "prompt.txt");
const TMP_PENDING_VOCAB_PATH = path.join("/tmp", "pending_vocab.json");
const TMP_USERS_PATH = path.join("/tmp", "users.json");
const TMP_SESSIONS_PATH = path.join("/tmp", "sessions.json");
const TMP_PROMPT_HISTORY_PATH = path.join("/tmp", "prompt_history.json");
const TMP_TRANSLATION_HISTORY_PATH = path.join("/tmp", "translation_history.json");
const TMP_API_KEY_USAGE_PATH = path.join("/tmp", "api_key_usage.json");
const TMP_MODELS_PATH = path.join("/tmp", "models.json");

const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

function isPostgresConfigured(): boolean {
  return !!(
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.POSTGRES_PRISMA_URL
  );
}

let pgInitAttempted = false;

async function ensurePgTables(): Promise<boolean> {
  if (!isPostgresConfigured()) return false;
  if (pgInitAttempted) return true;

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS prompt_store (
        key VARCHAR(255) PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(255) PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        picture TEXT,
        password_hash TEXT,
        auth_provider VARCHAR(50) DEFAULT 'google',
        role VARCHAR(50) DEFAULT 'user',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS sessions (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS prompt_history (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        user_email VARCHAR(255) NOT NULL,
        user_name VARCHAR(255) NOT NULL,
        topic TEXT NOT NULL,
        qtype VARCHAR(50) NOT NULL,
        model VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS translation_history (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255),
        user_email VARCHAR(255),
        user_name VARCHAR(255),
        is_guest BOOLEAN DEFAULT FALSE,
        guest_identifier VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS api_key_usage (
        usage_date VARCHAR(20) NOT NULL,
        key_id VARCHAR(64) NOT NULL,
        request_count INTEGER DEFAULT 0,
        PRIMARY KEY (usage_date, key_id)
      );
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS gemini_models (
        name VARCHAR(100) PRIMARY KEY,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    pgInitAttempted = true;
    return true;
  } catch (err) {
    console.error("Vercel Postgres table initialization failed:", err);
    return false;
  }
}

// Fallback in-memory / file stores for preview environments
let memoryUsers: Record<string, any> = {};
let memorySessions: Record<string, any> = {};
let memoryPromptHistory: Array<any> = [];
let memoryTranslationHistory: Array<any> = [];
let memoryApiKeyUsage: Record<string, number> = {};
let memoryModels: string[] = ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"];

async function loadFallbackData() {
  try {
    const uData = await fs.promises.readFile(TMP_USERS_PATH, "utf-8");
    memoryUsers = JSON.parse(uData);
  } catch {}
  try {
    const sData = await fs.promises.readFile(TMP_SESSIONS_PATH, "utf-8");
    memorySessions = JSON.parse(sData);
  } catch {}
  try {
    const hData = await fs.promises.readFile(TMP_PROMPT_HISTORY_PATH, "utf-8");
    memoryPromptHistory = JSON.parse(hData);
  } catch {}
  try {
    const tData = await fs.promises.readFile(TMP_TRANSLATION_HISTORY_PATH, "utf-8");
    memoryTranslationHistory = JSON.parse(tData);
  } catch {}
  try {
    const kData = await fs.promises.readFile(TMP_API_KEY_USAGE_PATH, "utf-8");
    memoryApiKeyUsage = JSON.parse(kData);
  } catch {}
  try {
    const mData = await fs.promises.readFile(TMP_MODELS_PATH, "utf-8");
    const parsed = JSON.parse(mData);
    if (Array.isArray(parsed) && parsed.length > 0) {
      memoryModels = parsed;
    }
  } catch {}
}
loadFallbackData();

async function saveFallbackUsers() {
  try {
    await fs.promises.writeFile(TMP_USERS_PATH, JSON.stringify(memoryUsers, null, 2));
  } catch {}
}
async function saveFallbackSessions() {
  try {
    await fs.promises.writeFile(TMP_SESSIONS_PATH, JSON.stringify(memorySessions, null, 2));
  } catch {}
}
async function saveFallbackPromptHistory() {
  try {
    await fs.promises.writeFile(TMP_PROMPT_HISTORY_PATH, JSON.stringify(memoryPromptHistory, null, 2));
  } catch {}
}
async function saveFallbackTranslationHistory() {
  try {
    await fs.promises.writeFile(TMP_TRANSLATION_HISTORY_PATH, JSON.stringify(memoryTranslationHistory, null, 2));
  } catch {}
}
async function saveFallbackApiKeyUsage() {
  try {
    await fs.promises.writeFile(TMP_API_KEY_USAGE_PATH, JSON.stringify(memoryApiKeyUsage, null, 2));
  } catch {}
}
async function saveFallbackModels() {
  try {
    await fs.promises.writeFile(TMP_MODELS_PATH, JSON.stringify(memoryModels, null, 2));
  } catch {}
}

async function getAdminModels(): Promise<string[]> {
  if (isPostgresConfigured()) {
    try {
      await ensurePgTables();
      const { rows } = await sql`SELECT name FROM gemini_models ORDER BY created_at ASC;`;
      if (rows && rows.length > 0) {
        return rows.map((r: any) => r.name);
      } else {
        const defaults = ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"];
        for (const m of defaults) {
          await sql`INSERT INTO gemini_models (name) VALUES (${m}) ON CONFLICT DO NOTHING;`;
        }
        return defaults;
      }
    } catch (err) {
      console.error("Error fetching models from Postgres:", err);
    }
  }

  if (!memoryModels || memoryModels.length === 0) {
    memoryModels = ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"];
    await saveFallbackModels();
  }
  return memoryModels;
}

async function addAdminModel(modelName: string): Promise<string[]> {
  const clean = modelName.trim();
  if (!clean) throw new Error("Model name cannot be empty.");

  if (isPostgresConfigured()) {
    try {
      await ensurePgTables();
      await sql`INSERT INTO gemini_models (name) VALUES (${clean}) ON CONFLICT DO NOTHING;`;
    } catch (err) {
      console.error("Error adding model to Postgres:", err);
    }
  }

  if (!memoryModels.includes(clean)) {
    memoryModels.push(clean);
    await saveFallbackModels();
  }

  return await getAdminModels();
}

async function deleteAdminModel(modelName: string): Promise<string[]> {
  const clean = modelName.trim();
  const currentModels = await getAdminModels();
  if (currentModels.length <= 1) {
    throw new Error("Cannot delete the last remaining model. At least one model must be available.");
  }

  if (isPostgresConfigured()) {
    try {
      await ensurePgTables();
      await sql`DELETE FROM gemini_models WHERE name = ${clean};`;
    } catch (err) {
      console.error("Error deleting model from Postgres:", err);
    }
  }

  memoryModels = memoryModels.filter((m) => m !== clean);
  await saveFallbackModels();

  return await getAdminModels();
}

interface User {
  id: string;
  email: string;
  name: string;
  picture?: string;
  password_hash?: string;
  auth_provider: string;
  role: string;
  created_at?: string;
  last_login?: string;
}

async function findUserByEmail(email: string): Promise<User | null> {
  const cleanEmail = email.toLowerCase().trim();
  if (isPostgresConfigured()) {
    try {
      await ensurePgTables();
      const { rows } = await sql`SELECT * FROM users WHERE LOWER(email) = ${cleanEmail}`;
      if (rows && rows.length > 0) return rows[0] as User;
    } catch (err) {
      console.error("Error finding user by email in Postgres:", err);
    }
  }

  const found = Object.values(memoryUsers).find(
    (u: any) => u.email.toLowerCase() === cleanEmail
  );
  return (found as User) || null;
}

async function findUserById(id: string): Promise<User | null> {
  if (isPostgresConfigured()) {
    try {
      await ensurePgTables();
      const { rows } = await sql`SELECT * FROM users WHERE id = ${id}`;
      if (rows && rows.length > 0) return rows[0] as User;
    } catch (err) {
      console.error("Error finding user by ID in Postgres:", err);
    }
  }
  return (memoryUsers[id] as User) || null;
}

async function createUser(user: Omit<User, "id">): Promise<User> {
  const id = "usr_" + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  const now = new Date().toISOString();
  const newUser: User = {
    id,
    email: user.email.toLowerCase().trim(),
    name: user.name,
    picture: user.picture || "",
    password_hash: user.password_hash || "",
    auth_provider: user.auth_provider || "google",
    role: user.role || "user",
    created_at: now,
    last_login: now,
  };

  if (isPostgresConfigured()) {
    try {
      await ensurePgTables();
      await sql`
        INSERT INTO users (id, email, name, picture, password_hash, auth_provider, role, created_at, last_login)
        VALUES (${newUser.id}, ${newUser.email}, ${newUser.name}, ${newUser.picture}, ${newUser.password_hash}, ${newUser.auth_provider}, ${newUser.role}, NOW(), NOW());
      `;
    } catch (err) {
      console.error("Error inserting user into Postgres:", err);
    }
  }

  memoryUsers[id] = newUser;
  await saveFallbackUsers();
  return newUser;
}

async function updateUserLastLogin(userId: string): Promise<void> {
  const now = new Date().toISOString();
  if (isPostgresConfigured()) {
    try {
      await ensurePgTables();
      await sql`UPDATE users SET last_login = NOW() WHERE id = ${userId}`;
    } catch (err) {
      console.error("Error updating user last login in Postgres:", err);
    }
  }
  if (memoryUsers[userId]) {
    memoryUsers[userId].last_login = now;
    await saveFallbackUsers();
  }
}

async function updateUserRole(userId: string, newRole: string): Promise<User | null> {
  if (isPostgresConfigured()) {
    try {
      await ensurePgTables();
      await sql`UPDATE users SET role = ${newRole} WHERE id = ${userId}`;
    } catch (err) {
      console.error("Error updating user role in Postgres:", err);
    }
  }

  if (memoryUsers[userId]) {
    memoryUsers[userId].role = newRole;
    await saveFallbackUsers();
    return memoryUsers[userId];
  }

  const user = await findUserById(userId);
  if (user) {
    user.role = newRole;
  }
  return user;
}

async function updateUserName(userId: string, newName: string): Promise<User | null> {
  if (isPostgresConfigured()) {
    try {
      await ensurePgTables();
      await sql`UPDATE users SET name = ${newName} WHERE id = ${userId}`;
    } catch (err) {
      console.error("Error updating user name in Postgres:", err);
    }
  }

  if (memoryUsers[userId]) {
    memoryUsers[userId].name = newName;
    await saveFallbackUsers();
    return memoryUsers[userId];
  }

  const user = await findUserById(userId);
  if (user) {
    user.name = newName;
  }
  return user;
}

async function createSession(userId: string): Promise<{ id: string; user_id: string }> {
  const sessionId = "sess_" + crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days

  if (isPostgresConfigured()) {
    try {
      await ensurePgTables();
      await sql`
        INSERT INTO sessions (id, user_id, expires_at)
        VALUES (${sessionId}, ${userId}, ${expiresAt});
      `;
    } catch (err) {
      console.error("Error creating session in Postgres:", err);
    }
  }

  memorySessions[sessionId] = { id: sessionId, user_id: userId, expires_at: expiresAt };
  await saveFallbackSessions();
  return { id: sessionId, user_id: userId };
}

async function getUserBySession(sessionId: string): Promise<User | null> {
  if (isPostgresConfigured()) {
    try {
      await ensurePgTables();
      const { rows } = await sql`
        SELECT u.* FROM users u
        JOIN sessions s ON u.id = s.user_id
        WHERE s.id = ${sessionId} AND s.expires_at > NOW();
      `;
      if (rows && rows.length > 0) return rows[0] as User;
    } catch (err) {
      console.error("Error getting user by session in Postgres:", err);
    }
  }

  const sess = memorySessions[sessionId];
  if (!sess) return null;
  if (new Date(sess.expires_at).getTime() < Date.now()) {
    delete memorySessions[sessionId];
    await saveFallbackSessions();
    return null;
  }
  return await findUserById(sess.user_id);
}

async function deleteSession(sessionId: string): Promise<void> {
  if (isPostgresConfigured()) {
    try {
      await ensurePgTables();
      await sql`DELETE FROM sessions WHERE id = ${sessionId}`;
    } catch (err) {
      console.error("Error deleting session in Postgres:", err);
    }
  }
  delete memorySessions[sessionId];
  await saveFallbackSessions();
}

async function getAllUsers(): Promise<User[]> {
  if (isPostgresConfigured()) {
    try {
      await ensurePgTables();
      const { rows } = await sql`
        SELECT id, email, name, picture, auth_provider, role, created_at, last_login
        FROM users ORDER BY created_at DESC;
      `;
      if (rows) return rows as User[];
    } catch (err) {
      console.error("Error getting all users from Postgres:", err);
    }
  }
  return Object.values(memoryUsers).map((u: any) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    picture: u.picture,
    auth_provider: u.auth_provider,
    role: u.role,
    created_at: u.created_at,
    last_login: u.last_login,
  }));
}

async function addPromptHistory(item: {
  userId: string;
  userEmail: string;
  userName: string;
  topic: string;
  qtype: string;
  model: string;
}): Promise<void> {
  const id = "ph_" + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  const now = new Date().toISOString();

  if (isPostgresConfigured()) {
    try {
      await ensurePgTables();
      await sql`
        INSERT INTO prompt_history (id, user_id, user_email, user_name, topic, qtype, model, created_at)
        VALUES (${id}, ${item.userId}, ${item.userEmail}, ${item.userName}, ${item.topic}, ${item.qtype}, ${item.model}, NOW());
      `;
    } catch (err) {
      console.error("Error adding prompt history in Postgres:", err);
    }
  }

  memoryPromptHistory.unshift({
    id,
    user_id: item.userId,
    user_email: item.userEmail,
    user_name: item.userName,
    topic: item.topic,
    qtype: item.qtype,
    model: item.model,
    created_at: now,
  });
  await saveFallbackPromptHistory();
}

async function getPromptHistory(): Promise<any[]> {
  if (isPostgresConfigured()) {
    try {
      await ensurePgTables();
      const { rows } = await sql`
        SELECT * FROM prompt_history ORDER BY created_at DESC;
      `;
      if (rows) return rows;
    } catch (err) {
      console.error("Error getting prompt history from Postgres:", err);
    }
  }
  return memoryPromptHistory;
}

async function deletePromptHistoryItem(id: string): Promise<boolean> {
  if (isPostgresConfigured()) {
    try {
      await ensurePgTables();
      await sql`DELETE FROM prompt_history WHERE id = ${id}`;
    } catch (err) {
      console.error("Error deleting prompt history item in Postgres:", err);
    }
  }

  memoryPromptHistory = memoryPromptHistory.filter((item) => item.id !== id);
  await saveFallbackPromptHistory();
  return true;
}

async function recordTranslation(item: {
  userId?: string;
  userEmail?: string;
  userName?: string;
  isGuest: boolean;
  guestIdentifier?: string;
}): Promise<void> {
  const id = "tr_" + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  const now = new Date().toISOString();

  if (isPostgresConfigured()) {
    try {
      await ensurePgTables();
      await sql`
        INSERT INTO translation_history (id, user_id, user_email, user_name, is_guest, guest_identifier, created_at)
        VALUES (${id}, ${item.userId || null}, ${item.userEmail || null}, ${item.userName || null}, ${item.isGuest}, ${item.guestIdentifier || null}, NOW());
      `;
    } catch (err) {
      console.error("Error recording translation in Postgres:", err);
    }
  }

  memoryTranslationHistory.unshift({
    id,
    user_id: item.userId || null,
    user_email: item.userEmail || null,
    user_name: item.userName || null,
    is_guest: item.isGuest,
    guest_identifier: item.guestIdentifier || null,
    created_at: now,
  });
  await saveFallbackTranslationHistory();
}

async function getNextGuestIdentifier(): Promise<string> {
  let records: any[] = [];
  if (isPostgresConfigured()) {
    try {
      await ensurePgTables();
      const { rows } = await sql`
        SELECT DISTINCT guest_identifier FROM translation_history WHERE is_guest = TRUE AND guest_identifier IS NOT NULL;
      `;
      if (rows) records = rows;
    } catch (err) {
      records = memoryTranslationHistory;
    }
  } else {
    records = memoryTranslationHistory;
  }

  let maxNum = 0;
  for (const r of records) {
    const gid = r.guest_identifier || r.guestIdentifier;
    if (gid && typeof gid === "string") {
      const match = gid.match(/^guest-(\d+)$/i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxNum) {
          maxNum = num;
        }
      }
    }
  }
  return `guest-${maxNum + 1}`;
}

async function getTranslationStats(): Promise<{
  users: Array<{ user_id: string; email: string; name: string; count: number; last_translated: string }>;
  guests: Array<{ guest_id: string; count: number; last_translated: string }>;
  total: number;
}> {
  let records: any[] = [];
  if (isPostgresConfigured()) {
    try {
      await ensurePgTables();
      const { rows } = await sql`
        SELECT * FROM translation_history ORDER BY created_at DESC;
      `;
      if (rows) records = rows;
    } catch (err) {
      records = memoryTranslationHistory;
    }
  } else {
    records = memoryTranslationHistory;
  }

  const userCountsMap: Record<string, { user_id: string; email: string; name: string; count: number; last_translated: string }> = {};
  const guestCountsMap: Record<string, { guest_id: string; count: number; last_translated: string }> = {};

  for (const r of records) {
    const isGuest = Boolean(r.is_guest || r.isGuest);
    const createdAt = r.created_at || r.createdAt || new Date().toISOString();

    if (isGuest) {
      const gid = r.guest_identifier || r.guestIdentifier || "guest-1";
      if (!guestCountsMap[gid]) {
        guestCountsMap[gid] = { guest_id: gid, count: 0, last_translated: createdAt };
      }
      guestCountsMap[gid].count += 1;
      if (new Date(createdAt) > new Date(guestCountsMap[gid].last_translated)) {
        guestCountsMap[gid].last_translated = createdAt;
      }
    } else {
      const uid = r.user_id || r.userId;
      if (uid) {
        if (!userCountsMap[uid]) {
          userCountsMap[uid] = {
            user_id: uid,
            email: r.user_email || r.userEmail || "",
            name: r.user_name || r.userName || "User",
            count: 0,
            last_translated: createdAt,
          };
        }
        userCountsMap[uid].count += 1;
        if (new Date(createdAt) > new Date(userCountsMap[uid].last_translated)) {
          userCountsMap[uid].last_translated = createdAt;
        }
      }
    }
  }

  const guests = Object.values(guestCountsMap).sort((a, b) => {
    const numA = parseInt(a.guest_id.replace(/\D/g, ""), 10) || 0;
    const numB = parseInt(b.guest_id.replace(/\D/g, ""), 10) || 0;
    return numA - numB;
  });

  const users = Object.values(userCountsMap).sort((a, b) => b.count - a.count);

  return {
    users,
    guests,
    total: records.length,
  };
}

const API_KEY_DAILY_LIMIT = 1500;

function getKeyIdentifier(userApiKey?: string): { id: string; isDefault: boolean; label: string } {
  const cleanKey = (userApiKey || "").trim();
  if (!cleanKey) {
    return { id: "default", isDefault: true, label: "Default Server Key" };
  }
  const hash = crypto.createHash("sha256").update(cleanKey).digest("hex").slice(0, 12);
  const maskedKey = cleanKey.length > 8 ? `${cleanKey.slice(0, 4)}...${cleanKey.slice(-4)}` : "Custom Key";
  return { id: `key_${hash}`, isDefault: false, label: `Custom Key (${maskedKey})` };
}

async function getApiKeyUsage(userApiKey?: string) {
  const dateStr = new Date().toISOString().slice(0, 10);
  const keyInfo = getKeyIdentifier(userApiKey);
  const compositeKey = `${dateStr}:${keyInfo.id}`;

  let used = 0;

  if (isPostgresConfigured()) {
    try {
      await ensurePgTables();
      const { rows } = await sql`
        SELECT request_count FROM api_key_usage
        WHERE usage_date = ${dateStr} AND key_id = ${keyInfo.id};
      `;
      if (rows && rows.length > 0) {
        used = Number(rows[0].request_count) || 0;
      }
    } catch (err) {
      console.error("Error fetching API key usage from Postgres:", err);
      used = memoryApiKeyUsage[compositeKey] || 0;
    }
  } else {
    used = memoryApiKeyUsage[compositeKey] || 0;
  }

  const remaining = Math.max(0, API_KEY_DAILY_LIMIT - used);
  const percentage = Math.min(100, Math.round((used / API_KEY_DAILY_LIMIT) * 1000) / 10);

  return {
    usedToday: used,
    dailyLimit: API_KEY_DAILY_LIMIT,
    remainingToday: remaining,
    percentage,
    isDefault: keyInfo.isDefault,
    label: keyInfo.label,
    date: dateStr,
  };
}

async function incrementApiKeyUsage(userApiKey?: string) {
  const dateStr = new Date().toISOString().slice(0, 10);
  const keyInfo = getKeyIdentifier(userApiKey);
  const compositeKey = `${dateStr}:${keyInfo.id}`;

  memoryApiKeyUsage[compositeKey] = (memoryApiKeyUsage[compositeKey] || 0) + 1;
  await saveFallbackApiKeyUsage();

  if (isPostgresConfigured()) {
    try {
      await ensurePgTables();
      await sql`
        INSERT INTO api_key_usage (usage_date, key_id, request_count)
        VALUES (${dateStr}, ${keyInfo.id}, 1)
        ON CONFLICT (usage_date, key_id)
        DO UPDATE SET request_count = api_key_usage.request_count + 1;
      `;
    } catch (err) {
      console.error("Error incrementing API key usage in Postgres:", err);
    }
  }

  return await getApiKeyUsage(userApiKey);
}

function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.substring(7).trim();
  }
  return null;
}

async function getCurrentUser(req: Request): Promise<User | null> {
  const token = req.cookies?.session_id || req.cookies?.session_token || extractBearerToken(req);
  if (!token || token === "[object Object]") return null;
  return await getUserBySession(token);
}

function setSessionCookie(res: Response, token: string) {
  res.cookie("session_id", token, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
  res.cookie("session_token", token, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

async function kvGet(key: string): Promise<string | null> {
  if (!KV_URL || !KV_TOKEN) return null;
  try {
    const res = await fetch(`${KV_URL}/get/${key}`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { result?: string };
    return data.result ?? null;
  } catch (err) {
    console.error(`KV get error for ${key}:`, err);
    return null;
  }
}

async function kvSet(key: string, value: string): Promise<boolean> {
  if (!KV_URL || !KV_TOKEN) return false;
  try {
    const res = await fetch(`${KV_URL}/set/${key}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${KV_TOKEN}`,
        "Content-Type": "text/plain",
      },
      body: value,
    });
    return res.ok;
  } catch (err) {
    console.error(`KV set error for ${key}:`, err);
    return false;
  }
}

const TEMPLATE_FILES: Record<string, string> = {
  normal: path.join(TEMPLATES_DIR, "QuestionNormal.docx"),
  statement: path.join(TEMPLATES_DIR, "QuestionStatement.docx"),
  code: path.join(TEMPLATES_DIR, "QuestionCode.docx"),
};

const VALID_TYPES = new Set(Object.keys(TEMPLATE_FILES));

let inMemoryPrompt: string | null = null;
let inMemoryPendingVocab: Array<{ id: string; english: string; sinhala: string; date: string }> | null = null;

async function getPromptContent(): Promise<string> {
  // 1. Try Vercel Postgres if configured
  if (isPostgresConfigured()) {
    try {
      await ensurePgTables();
      const { rows } = await sql`SELECT value FROM prompt_store WHERE key = 'prompt'`;
      if (rows && rows.length > 0 && rows[0].value) {
        inMemoryPrompt = rows[0].value;
        return rows[0].value;
      }
    } catch (err) {
      console.error("Error reading prompt from Vercel Postgres:", err);
    }
  }

  // 2. Try Cloud KV if configured
  const kvData = await kvGet("glossary_prompt");
  if (kvData !== null) {
    inMemoryPrompt = kvData;
    if (isPostgresConfigured()) {
      savePromptContent(kvData).catch(() => {});
    }
    return kvData;
  }

  if (inMemoryPrompt !== null) {
    return inMemoryPrompt;
  }

  let fileContent = "";
  try {
    fileContent = await fs.promises.readFile(TMP_PROMPT_PATH, "utf-8");
  } catch {
    try {
      fileContent = await fs.promises.readFile(PROMPT_PATH, "utf-8");
    } catch {
      fileContent = "";
    }
  }

  inMemoryPrompt = fileContent;

  if (isPostgresConfigured() && fileContent) {
    savePromptContent(fileContent).catch(() => {});
  }

  return fileContent;
}

async function savePromptContent(content: string): Promise<void> {
  inMemoryPrompt = content;

  // 1. Save to Vercel Postgres if configured
  if (isPostgresConfigured()) {
    try {
      await ensurePgTables();
      await sql`
        INSERT INTO prompt_store (key, value)
        VALUES ('prompt', ${content})
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP;
      `;
    } catch (err) {
      console.error("Error saving prompt to Vercel Postgres:", err);
    }
  }

  // 2. Save to Cloud KV if available
  await kvSet("glossary_prompt", content);

  // 3. Save to filesystem as fallback
  try {
    await fs.promises.writeFile(PROMPT_PATH, content, "utf-8");
    return;
  } catch (err) {
    console.warn("Writing to root PROMPT_PATH failed (likely read-only deployment environment), falling back to /tmp:", err);
  }

  try {
    await fs.promises.writeFile(TMP_PROMPT_PATH, content, "utf-8");
  } catch (err) {
    console.error("Writing to /tmp/prompt.txt also failed:", err);
  }
}

async function getPendingVocab(): Promise<Array<{ id: string; english: string; sinhala: string; date: string }>> {
  // 1. Try Vercel Postgres if configured
  if (isPostgresConfigured()) {
    try {
      await ensurePgTables();
      const { rows } = await sql`SELECT value FROM prompt_store WHERE key = 'pending_vocab'`;
      if (rows && rows.length > 0 && rows[0].value) {
        const parsed = JSON.parse(rows[0].value);
        inMemoryPendingVocab = parsed;
        return parsed;
      }
    } catch (err) {
      console.error("Error reading pending vocab from Vercel Postgres:", err);
    }
  }

  // 2. Try Cloud KV if configured
  const kvData = await kvGet("pending_vocab");
  if (kvData !== null) {
    try {
      const parsed = JSON.parse(kvData);
      inMemoryPendingVocab = parsed;
      return parsed;
    } catch {}
  }

  if (inMemoryPendingVocab !== null) {
    return inMemoryPendingVocab;
  }

  try {
    const tmpData = await fs.promises.readFile(TMP_PENDING_VOCAB_PATH, "utf-8");
    inMemoryPendingVocab = JSON.parse(tmpData);
    return inMemoryPendingVocab;
  } catch {}

  try {
    const data = await fs.promises.readFile(PENDING_VOCAB_PATH, "utf-8");
    inMemoryPendingVocab = JSON.parse(data);
    return inMemoryPendingVocab;
  } catch {
    inMemoryPendingVocab = [];
    return [];
  }
}

async function savePendingVocab(list: Array<{ id: string; english: string; sinhala: string; date: string }>): Promise<void> {
  inMemoryPendingVocab = list;
  const jsonStr = JSON.stringify(list, null, 2);

  // 1. Save to Vercel Postgres if configured
  if (isPostgresConfigured()) {
    try {
      await ensurePgTables();
      await sql`
        INSERT INTO prompt_store (key, value)
        VALUES ('pending_vocab', ${jsonStr})
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP;
      `;
    } catch (err) {
      console.error("Error saving pending vocab to Vercel Postgres:", err);
    }
  }

  // 2. Save to Cloud KV if available
  await kvSet("pending_vocab", jsonStr);

  try {
    await fs.promises.writeFile(PENDING_VOCAB_PATH, jsonStr, "utf-8");
    return;
  } catch (err) {
    console.warn("Writing to root PENDING_VOCAB_PATH failed (likely read-only deployment environment), falling back to /tmp:", err);
  }

  try {
    await fs.promises.writeFile(TMP_PENDING_VOCAB_PATH, jsonStr, "utf-8");
  } catch (err) {
    console.error("Writing to /tmp/pending_vocab.json also failed:", err);
  }
}

function parseVocabulary(promptContent: string): Array<{ english: string; sinhala: string }> {
  const match = promptContent.match(/\[VOCAB_START\]([\s\S]*?)\[VOCAB_END\]/);
  if (!match) return [];
  const lines = match[1].split("\n");
  const vocab: Array<{ english: string; sinhala: string }> = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("-")) {
      const parts = trimmed.substring(1).split(":");
      if (parts.length >= 2) {
        const eng = parts[0].trim();
        const sin = parts.slice(1).join(":").trim();
        if (eng && sin) {
          vocab.push({ english: eng, sinhala: sin });
        }
      }
    }
  }
  return vocab;
}

function updateVocabularyInPrompt(
  promptContent: string,
  vocabList: Array<{ english: string; sinhala: string }>
): string {
  const vocabBlock =
    "[VOCAB_START]\n" +
    vocabList.map((item) => `- ${item.english}: ${item.sinhala}`).join("\n") +
    "\n[VOCAB_END]";

  if (promptContent.includes("[VOCAB_START]")) {
    return promptContent.replace(
      /\[VOCAB_START\][\s\S]*?\[VOCAB_END\]/,
      vocabBlock
    );
  } else {
    return promptContent + "\n\n5) Mandatory Vocabulary Mapping\n[VOCAB_START]\n" + vocabBlock + "\n[VOCAB_END]\n";
  }
}

function extractJson(rawText: string): any {
  let text = rawText.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```[a-zA-Z]*\n?/, "");
    text = text.replace(/```\s*$/, "").trim();
  }
  return JSON.parse(text);
}

function buildReplacements(resdict: any, qtype: string): Record<string, string | TextSegment[]> {
  if (qtype === "normal") {
    return {
      "Question English": resdict["QEng"] || "",
      "Question Sinhala": toLegacySegments(resdict["QSin"] || ""),

      "Answer 1 English": resdict["AnswersEng"]?.[0] || "",
      "Answer 2 English": resdict["AnswersEng"]?.[1] || "",
      "Answer 3 English": resdict["AnswersEng"]?.[2] || "",
      "Answer 4 English": resdict["AnswersEng"]?.[3] || "",
      "Answer 5 English": resdict["AnswersEng"]?.[4] || "",
      "Answer 1 Sinhala": toLegacySegments(resdict["AnswersSin"]?.[0] || ""),
      "Answer 2 Sinhala": toLegacySegments(resdict["AnswersSin"]?.[1] || ""),
      "Answer 3 Sinhala": toLegacySegments(resdict["AnswersSin"]?.[2] || ""),
      "Answer 4 Sinhala": toLegacySegments(resdict["AnswersSin"]?.[3] || ""),
      "Answer 5 Sinhala": toLegacySegments(resdict["AnswersSin"]?.[4] || ""),

      "Explanation 1 English": resdict["ExplEng"]?.[0] || "",
      "Explanation 2 English": resdict["ExplEng"]?.[1] || "",
      "Explanation 3 English": resdict["ExplEng"]?.[2] || "",
      "Explanation 4 English": resdict["ExplEng"]?.[3] || "",
      "Explanation 5 English": resdict["ExplEng"]?.[4] || "",
      "Explanation 1 Sinhala": toLegacySegments(resdict["ExplSin"]?.[0] || ""),
      "Explanation 2 Sinhala": toLegacySegments(resdict["ExplSin"]?.[1] || ""),
      "Explanation 3 Sinhala": toLegacySegments(resdict["ExplSin"]?.[2] || ""),
      "Explanation 4 Sinhala": toLegacySegments(resdict["ExplSin"]?.[3] || ""),
      "Explanation 5 Sinhala": toLegacySegments(resdict["ExplSin"]?.[4] || ""),

      "QNum": String(resdict["AnsNo"] ?? ""),
    };
  }

  if (qtype === "statement") {
    return {
      "Question English": resdict["QEng"] || "",
      "Question Sinhala": toLegacySegments(resdict["QSin"] || ""),

      "StateAEng": resdict["StatementsEng"]?.[0] || "",
      "StateBEng": resdict["StatementsEng"]?.[1] || "",
      "StateCEng": resdict["StatementsEng"]?.[2] || "",
      "StateASin": toLegacySegments(resdict["StatementsSin"]?.[0] || ""),
      "StateBSin": toLegacySegments(resdict["StatementsSin"]?.[1] || ""),
      "StateCSin": toLegacySegments(resdict["StatementsSin"]?.[2] || ""),

      "Answer 1 English": resdict["AnswersEng"]?.[0] || "",
      "Answer 2 English": resdict["AnswersEng"]?.[1] || "",
      "Answer 3 English": resdict["AnswersEng"]?.[2] || "",
      "Answer 4 English": resdict["AnswersEng"]?.[3] || "",
      "Answer 5 English": resdict["AnswersEng"]?.[4] || "",
      "Answer 1 Sinhala": toLegacySegments(resdict["AnswersSin"]?.[0] || ""),
      "Answer 2 Sinhala": toLegacySegments(resdict["AnswersSin"]?.[1] || ""),
      "Answer 3 Sinhala": toLegacySegments(resdict["AnswersSin"]?.[2] || ""),
      "Answer 4 Sinhala": toLegacySegments(resdict["AnswersSin"]?.[3] || ""),
      "Answer 5 Sinhala": toLegacySegments(resdict["AnswersSin"]?.[4] || ""),

      "ExplAEng": resdict["ExplEng"]?.[0] || "",
      "ExplBEng": resdict["ExplEng"]?.[1] || "",
      "ExplCEng": resdict["ExplEng"]?.[2] || "",
      "ExplASin": toLegacySegments(resdict["ExplSin"]?.[0] || ""),
      "ExplBSin": toLegacySegments(resdict["ExplSin"]?.[1] || ""),
      "ExplCSin": toLegacySegments(resdict["ExplSin"]?.[2] || ""),

      "QNum": String(resdict["AnsNo"] ?? ""),
    };
  }

  if (qtype === "code") {
    return {
      "Question English": resdict["QEng"] || "",
      "Question Sinhala": toLegacySegments(resdict["QSin"] || ""),

      "codelines": resdict["Code"] || "",

      "Answer 1 English": resdict["AnswersEng"]?.[0] || "",
      "Answer 2 English": resdict["AnswersEng"]?.[1] || "",
      "Answer 3 English": resdict["AnswersEng"]?.[2] || "",
      "Answer 4 English": resdict["AnswersEng"]?.[3] || "",
      "Answer 5 English": resdict["AnswersEng"]?.[4] || "",
      "Answer 1 Sinhala": toLegacySegments(resdict["AnswersSin"]?.[0] || ""),
      "Answer 2 Sinhala": toLegacySegments(resdict["AnswersSin"]?.[1] || ""),
      "Answer 3 Sinhala": toLegacySegments(resdict["AnswersSin"]?.[2] || ""),
      "Answer 4 Sinhala": toLegacySegments(resdict["AnswersSin"]?.[3] || ""),
      "Answer 5 Sinhala": toLegacySegments(resdict["AnswersSin"]?.[4] || ""),

      "ExplanationEnglish": resdict["ExplEng"] || "",
      "ExplanationSinhala": toLegacySegments(resdict["ExplSin"] || ""),

      "QNum": String(resdict["AnsNo"] ?? ""),
    };
  }

  throw new Error(`Unknown question type: ${qtype}`);
}

const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

// Builds a single <w:r> run for one text segment, cloning the placeholder's
// original formatting and overriding just the font for English segments so
// they render in Times New Roman instead of the legacy Sinhala font.
// Newlines in `text` become real <w:br/> elements (Word ignores literal "\n"
// characters inside <w:t>, it doesn't turn them into line breaks).
function buildRun(
  doc: Document,
  templateRPr: Element | null,
  text: string,
  isEnglish: boolean
): Element {
  const run = doc.createElementNS(WORD_NS, "w:r");
  if (templateRPr) {
    const rPrClone = templateRPr.cloneNode(true) as Element;
    if (isEnglish) {
      const rFonts = rPrClone.getElementsByTagName("w:rFonts").item(0);
      if (rFonts) {
        rFonts.setAttribute("w:ascii", "Times New Roman");
        rFonts.setAttribute("w:hAnsi", "Times New Roman");
      }
    }
    run.appendChild(rPrClone);
  }
  text.split("\n").forEach((line, idx) => {
    if (idx > 0) run.appendChild(doc.createElementNS(WORD_NS, "w:br"));
    const t = doc.createElementNS(WORD_NS, "w:t");
    if (line.startsWith(" ") || line.endsWith(" ")) {
      t.setAttribute("xml:space", "preserve");
    }
    t.textContent = line;
    run.appendChild(t);
  });
  return run;
}

async function findAndReplaceInDocx(
  templatePath: string,
  replacements: Record<string, string | TextSegment[]>
): Promise<Buffer> {
  const content = await fs.promises.readFile(templatePath);
  const zip = await JSZip.loadAsync(content);

  const xmlFiles = Object.keys(zip.files).filter((filename) =>
    /^word\/.*\.xml$/.test(filename)
  );
  const domParser = new DOMParser();
  const xmlSerializer = new XMLSerializer();

  for (const xmlFile of xmlFiles) {
    const fileObj = zip.file(xmlFile);
    if (!fileObj) continue;
    const xmlText = await fileObj.async("string");
    const doc = domParser.parseFromString(xmlText, "text/xml");

    const paragraphs = doc.getElementsByTagName("w:p");
    let modified = false;

    for (let i = 0; i < paragraphs.length; i++) {
      const p = paragraphs.item(i);
      if (!p) continue;

      const tElementsLive = p.getElementsByTagName("w:t");
      if (!tElementsLive || tElementsLive.length === 0) continue;

      // getElementsByTagName() returns a LIVE list. We insert/remove <w:t>
      // nodes below, so we snapshot to a plain array up front - otherwise
      // the cleanup loop further down re-reads the now-mutated live list
      // and wipes out the very lines/segments we just inserted (this was
      // the root cause of "only the first line of code shows up").
      const tElements: Element[] = [];
      for (let j = 0; j < tElementsLive.length; j++) {
        tElements.push(tElementsLive.item(j)!);
      }

      let pText = "";
      for (const t of tElements) pText += t.textContent || "";

      let hasMatch = false;
      for (const oldKey of Object.keys(replacements)) {
        if (pText.includes(oldKey)) {
          hasMatch = true;
          break;
        }
      }
      if (!hasMatch) continue;

      // Plain string replacements first (a paragraph may contain more than
      // one placeholder).
      for (const [oldKey, newVal] of Object.entries(replacements)) {
        if (typeof newVal === "string") {
          pText = pText.split(oldKey).join(newVal);
        }
      }

      // Then look for a segmented (mixed Sinhala/English font) replacement.
      // Templates only ever put one such placeholder per paragraph.
      let segmentKey: string | null = null;
      let segments: TextSegment[] | null = null;
      for (const [oldKey, newVal] of Object.entries(replacements)) {
        if (Array.isArray(newVal) && pText.includes(oldKey)) {
          segmentKey = oldKey;
          segments = newVal;
          break;
        }
      }

      const firstT = tElements[0];
      const firstRun = firstT.parentNode as Element;

      if (segments && segmentKey) {
        const paragraphEl = firstRun.parentNode as Element;
        const templateRPr = firstRun.getElementsByTagName("w:rPr").item(0) ?? null;

        const idx = pText.indexOf(segmentKey);
        const before = pText.slice(0, idx);
        const after = pText.slice(idx + segmentKey.length);

        const newRuns: Element[] = [];
        if (before) newRuns.push(buildRun(doc, templateRPr, before, false));
        for (const seg of segments) {
          newRuns.push(buildRun(doc, templateRPr, seg.text, seg.isEnglish));
        }
        if (after) newRuns.push(buildRun(doc, templateRPr, after, false));

        for (const r of newRuns) paragraphEl.insertBefore(r, firstRun);
        paragraphEl.removeChild(firstRun);
      } else if (pText.includes("\n")) {
        const parent = firstT.parentNode;
        if (parent) {
          const lines = pText.split("\n");
          for (let l = 0; l < lines.length; l++) {
            if (l > 0) {
              parent.insertBefore(doc.createElementNS(WORD_NS, "w:br"), firstT);
            }
            const tNode = doc.createElementNS(WORD_NS, "w:t");
            if (lines[l].startsWith(" ") || lines[l].endsWith(" ")) {
              tNode.setAttribute("xml:space", "preserve");
            }
            tNode.textContent = lines[l];
            parent.insertBefore(tNode, firstT);
          }
          parent.removeChild(firstT);
        }
      } else {
        if (pText.startsWith(" ") || pText.endsWith(" ")) {
          firstT.setAttribute("xml:space", "preserve");
        }
        firstT.textContent = pText;
      }

      // Clear any leftover original <w:t> nodes (e.g. Word had split the
      // placeholder across multiple runs) - uses the snapshot, not a live list.
      for (let j = 1; j < tElements.length; j++) {
        tElements[j].textContent = "";
      }
      modified = true;
    }

    if (modified) {
      const updatedXml = xmlSerializer.serializeToString(doc);
      zip.file(xmlFile, updatedXml);
    }
  }

  return await zip.generateAsync({ type: "nodebuffer" });
}

// Serve static assets
app.use("/static", express.static(path.join(PROJECT_ROOT, "static")));

app.get("/", (req: Request, res: Response) => {
  res.sendFile(path.join(PROJECT_ROOT, "index.html"));
});

// ==========================================
// Authentication API Endpoints
// ==========================================

// Get Current Signed-In User
app.get("/api/auth/me", async (req: Request, res: Response) => {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return res.json({ user: null });
    }
    const role = (user.email && user.email.toLowerCase() === "sachoice51@gmail.com") ? "admin" : user.role;
    return res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        picture: user.picture,
        auth_provider: user.auth_provider,
        role: role,
        created_at: user.created_at,
        last_login: user.last_login,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to fetch user session." });
  }
});

function getRedirectUri(req: Request): string {
  let uri = "";
  if (req.query && typeof req.query.redirect_uri === "string" && req.query.redirect_uri) {
    uri = req.query.redirect_uri;
  } else {
    const host = req.get("host") || "localhost:3000";
    const protocol = (req.headers["x-forwarded-proto"] as string) || req.protocol || "http";
    const isCloudRun = host.includes(".run.app");
    const effProtocol = isCloudRun ? "https" : protocol;
    const appUrl = process.env.APP_URL || `${effProtocol}://${host}`;
    uri = `${appUrl.replace(/\/$/, "")}/api/auth/google/callback`;
  }
  // Standardize: strip any trailing slash or query params
  try {
    const u = new URL(uri);
    return `${u.origin}${u.pathname.replace(/\/$/, "")}`;
  } catch (_) {
    return uri.replace(/\/$/, "");
  }
}

// Get Google OAuth Client ID config for GIS
app.get("/api/auth/google/config", (req: Request, res: Response) => {
  return res.json({
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    configured: Boolean(process.env.GOOGLE_CLIENT_ID),
  });
});

// Google Credential / ID Token Authentication (Inline GIS flow)
app.post(["/api/auth/google/credential", "/api/auth/google/token"], async (req: Request, res: Response) => {
  try {
    const { credential, accessToken } = req.body || {};
    let email = "";
    let name = "";
    let picture = "";

    if (credential) {
      // Verify Google ID token via Google's tokeninfo endpoint
      const tokenRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        return res.status(400).json({ error: `Invalid Google credential token: ${errText}` });
      }
      const tokenInfo = await tokenRes.json();
      email = tokenInfo.email;
      name = tokenInfo.name || email?.split("@")[0] || "User";
      picture = tokenInfo.picture || "";
    } else if (accessToken) {
      const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!userRes.ok) {
        return res.status(400).json({ error: "Failed to fetch Google profile with access token." });
      }
      const gUser = await userRes.json();
      email = gUser.email;
      name = gUser.name || email?.split("@")[0] || "User";
      picture = gUser.picture || "";
    } else {
      return res.status(400).json({ error: "No Google credential or access token provided." });
    }

    if (!email) {
      return res.status(400).json({ error: "Could not retrieve email from Google account." });
    }

    let role = "user";
    if (email.toLowerCase() === "sachoice51@gmail.com") {
      role = "admin";
    }

    let user = await findUserByEmail(email);
    if (!user) {
      user = await createUser({
        email,
        name,
        role,
        auth_provider: "google",
      });
    } else {
      let updated = false;
      if (user.role !== role && email.toLowerCase() === "sachoice51@gmail.com") {
        user.role = role;
        updated = true;
      }
      if (updated) {
        await updateUser(user);
      }
    }

    const session = await createSession(user.id);
    const token = session.id;

    setSessionCookie(res, token);

    const userWithToken = { ...user, token };
    return res.json({ success: true, user: userWithToken, token });
  } catch (err: any) {
    console.error("Error in Google credential auth:", err);
    return res.status(500).json({ error: err.message || "Authentication failed." });
  }
});

// Get Google OAuth Authorization URL
app.get(["/api/auth/google", "/api/auth/google/url"], (req: Request, res: Response) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = getRedirectUri(req);

  if (!clientId) {
    return res.json({
      configured: false,
      url: null,
      redirectUri,
      message: "Google Client ID is not configured.",
    });
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid profile email",
    access_type: "offline",
    prompt: "select_account",
  });

  const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  return res.json({ configured: true, url, redirectUri });
});

// Google OAuth Callback Handler
app.get(["/api/auth/google/callback", "/api/auth/google/callback/"], async (req: Request, res: Response) => {
  const { code, error } = req.query;

  if (error || !code) {
    return res.status(400).send(`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_ERROR', error: ${JSON.stringify(error || "No auth code received")} }, '*');
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
          <p>Authentication failed: ${error || "No code received"}. You can close this window.</p>
        </body>
      </html>
    `);
  }

  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = getRedirectUri(req);

    // Exchange authorization code for token
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: String(code),
        client_id: clientId || "",
        client_secret: clientSecret || "",
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }).toString(),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      throw new Error(`Failed to exchange code: ${errText}`);
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    // Fetch Google user profile
    const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!userRes.ok) {
      throw new Error("Failed to fetch Google user profile.");
    }

    const gUser = await userRes.json();
    const email = gUser.email;
    const name = gUser.name || email.split("@")[0];
    const picture = gUser.picture || "";

    let role = "user";
    if (email.toLowerCase() === "sachoice51@gmail.com") {
      role = "admin";
    }

    let user = await findUserByEmail(email);
    if (!user) {
      const allUsers = await getAllUsers();
      if (allUsers.length === 0) role = "admin";

      user = await createUser({
        email,
        name,
        picture,
        auth_provider: "google",
        role,
      });
    } else {
      await updateUserLastLogin(user.id);
    }

    const session = await createSession(user.id);
    setSessionCookie(res, session.id);

    const safeUserJson = JSON.stringify({
      id: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture,
      role: user.role,
      token: session.id,
    });

    return res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Authentication Complete</title>
        </head>
        <body style="font-family: system-ui, -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background-color: #f8fafc; color: #0f172a;">
          <div style="text-align: center; padding: 32px; background: white; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); max-width: 400px; width: 90%;">
            <div style="font-size: 40px; margin-bottom: 12px;">✅</div>
            <h2 style="margin: 0 0 8px 0; font-size: 20px; font-weight: 600;">Sign In Successful!</h2>
            <p style="margin: 0; color: #64748b; font-size: 14px; line-height: 1.5;">You have successfully signed in. This window will close automatically.</p>
          </div>
          <script>
            const userData = ${safeUserJson};
            // 1) Store session token & event in localStorage for main window
            try {
              if (userData && userData.token) {
                localStorage.setItem("auth_session_token", userData.token);
              }
              localStorage.setItem("oauth_auth_success", JSON.stringify({ user: userData, timestamp: Date.now() }));
            } catch (e) {}

            // 2) Send postMessage to opener or parent if accessible
            try {
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', user: userData }, '*');
              }
            } catch (e) {}

            // 3) Broadcast via BroadcastChannel
            try {
              if (typeof BroadcastChannel !== 'undefined') {
                const bc = new BroadcastChannel('oauth_channel');
                bc.postMessage({ type: 'OAUTH_AUTH_SUCCESS', user: userData });
              }
            } catch (e) {}

            // 4) Close popup
            setTimeout(() => {
              try { window.close(); } catch (e) {}
            }, 500);
          </script>
        </body>
      </html>
    `);
  } catch (err: any) {
    console.error("Google OAuth Callback Error:", err);
    return res.status(500).send(`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_ERROR', error: ${JSON.stringify(err?.message || "OAuth processing error")} }, '*');
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
          <p>Authentication error: ${err?.message || "Server error"}. You can close this window.</p>
        </body>
      </html>
    `);
  }
});

// Helper to check admin access
function isUserAdminAccount(user: any, req?: Request): boolean {
  if (req && req.headers["x-admin-pass"] === "ictfromabcadmin") {
    return true;
  }
  if (user && user.email && user.email.toLowerCase() === "sachoice51@gmail.com") {
    return true;
  }
  if (user && user.role === "admin") {
    return true;
  }
  return false;
}

// Helper to check academic staff access
function isAcademicStaffAccount(user: any, req?: Request): boolean {
  if (isUserAdminAccount(user, req)) {
    return true;
  }
  if (!user) return false;
  const role = (user.role || "").toLowerCase().trim();
  return role === "academic_staff" || role === "academic staff" || role === "academicstaff";
}

// Email/Password Register (Disabled - Google Sign In Required for New Accounts)
app.post("/api/auth/register", async (req: Request, res: Response) => {
  return res.status(400).json({
    error: "Registration with email is disabled. Please sign in with Google to create a new account."
  });
});


// Logout
app.post("/api/auth/logout", async (req: Request, res: Response) => {
  const sessionId = req.cookies?.session_id || extractBearerToken(req);
  if (sessionId) {
    await deleteSession(sessionId);
  }
  res.clearCookie("session_id", { secure: true, sameSite: "none" });
  return res.json({ success: true });
});

// Update user display name / first name
app.post(["/api/user/update-name", "/api/user/name"], async (req: Request, res: Response) => {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ error: "Authentication required." });
    }
    const { name } = req.body || {};
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Name cannot be empty." });
    }
    const updatedUser = await updateUserName(user.id, name.trim());
    return res.json({ success: true, user: updatedUser });
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to update user name." });
  }
});

// Public: Get active vocabulary
app.get("/api/vocabulary", async (req: Request, res: Response) => {
  try {
    const prompt = await getPromptContent();
    const vocab = parseVocabulary(prompt);
    return res.json(vocab);
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to read prompt content." });
  }
});

// Submit word translation mapping (Academic Staff & Admin write directly; Users & Guests submit for review)
app.post("/api/vocabulary/suggest", async (req: Request, res: Response) => {
  const { english, sinhala } = req.body || {};
  const eng = (english || "").trim();
  const sin = (sinhala || "").trim();

  if (!eng || !sin) {
    return res.status(400).json({ error: "Both English and Sinhala words are required." });
  }

  try {
    const user = await getCurrentUser(req);

    // Academic Staff or Admin: Add directly to prompt without requiring admin approval!
    if (isAcademicStaffAccount(user, req)) {
      const prompt = await getPromptContent();
      const vocab = parseVocabulary(prompt);

      const existingIndex = vocab.findIndex(
        (v) => v.english.toLowerCase() === eng.toLowerCase()
      );
      if (existingIndex >= 0) {
        vocab[existingIndex] = { english: eng, sinhala: sin };
      } else {
        vocab.push({ english: eng, sinhala: sin });
      }

      const updatedPrompt = updateVocabularyInPrompt(prompt, vocab);
      await savePromptContent(updatedPrompt);

      return res.json({
        success: true,
        direct: true,
        vocabulary: vocab,
        message: "Word mapping directly added to prompt by Academic Staff / Admin!",
      });
    }

    // Standard user or guest: submit to pending queue for admin review
    const pending = await getPendingVocab();
    const existing = pending.find((item) => item.english.toLowerCase() === eng.toLowerCase());
    if (existing) {
      existing.sinhala = sin;
      existing.date = new Date().toISOString();
    } else {
      pending.push({
        id: Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
        english: eng,
        sinhala: sin,
        date: new Date().toISOString(),
      });
    }
    await savePendingVocab(pending);
    return res.json({ success: true, direct: false, message: "Translation suggestion submitted for admin review!" });
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to save translation suggestion." });
  }
});

// Admin: Get all registered users info
app.get("/api/admin/users", async (req: Request, res: Response) => {
  try {
    const user = await getCurrentUser(req);
    if (!isUserAdminAccount(user, req)) {
      return res.status(403).json({ error: "Admin authentication required." });
    }

    const users = await getAllUsers();
    return res.json(users);
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to fetch users list." });
  }
});

// Admin: Edit user role
app.patch("/api/admin/users/:id/role", async (req: Request, res: Response) => {
  try {
    const currentUser = await getCurrentUser(req);
    if (!isUserAdminAccount(currentUser, req)) {
      return res.status(403).json({ error: "Admin authentication required." });
    }

    const userId = req.params.id;
    const { role } = req.body || {};
    if (!userId || !role) {
      return res.status(400).json({ error: "User ID and new role are required." });
    }

    let cleanRole = role.toLowerCase().trim().replace(/\s+/g, "_");
    if (cleanRole === "academicstaff" || cleanRole === "academic_staff" || cleanRole === "academic staff") {
      cleanRole = "academic_staff";
    }

    const allowedRoles = ["user", "academic_staff", "admin"];
    if (!allowedRoles.includes(cleanRole)) {
      return res.status(400).json({ error: "Invalid role. Allowed roles: User, Academic Staff, Admin." });
    }

    const updatedUser = await updateUserRole(userId, cleanRole);
    if (!updatedUser) {
      return res.status(404).json({ error: "User not found." });
    }

    return res.json({ success: true, user: updatedUser });
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to update user role." });
  }
});

app.post("/api/admin/users/role", async (req: Request, res: Response) => {
  try {
    const currentUser = await getCurrentUser(req);
    if (!isUserAdminAccount(currentUser, req)) {
      return res.status(403).json({ error: "Admin authentication required." });
    }

    const { userId, role } = req.body || {};
    if (!userId || !role) {
      return res.status(400).json({ error: "User ID and new role are required." });
    }

    let cleanRole = role.toLowerCase().trim().replace(/\s+/g, "_");
    if (cleanRole === "academicstaff" || cleanRole === "academic_staff" || cleanRole === "academic staff") {
      cleanRole = "academic_staff";
    }

    const allowedRoles = ["user", "academic_staff", "admin"];
    if (!allowedRoles.includes(cleanRole)) {
      return res.status(400).json({ error: "Invalid role. Allowed roles: User, Academic Staff, Admin." });
    }

    const updatedUser = await updateUserRole(userId, cleanRole);
    if (!updatedUser) {
      return res.status(404).json({ error: "User not found." });
    }

    return res.json({ success: true, user: updatedUser });
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to update user role." });
  }
});

// Admin: Get prompt generation history by user
app.get("/api/admin/prompts", async (req: Request, res: Response) => {
  try {
    const user = await getCurrentUser(req);
    if (!isUserAdminAccount(user, req)) {
      return res.status(403).json({ error: "Admin authentication required." });
    }

    const prompts = await getPromptHistory();
    return res.json(prompts);
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to fetch prompt history." });
  }
});

// Admin: Get pending suggestions
app.get("/api/admin/pending", async (req: Request, res: Response) => {
  try {
    const pending = await getPendingVocab();
    return res.json(pending);
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to read pending suggestions." });
  }
});

// Admin: Approve a pending suggestion (writes to prompt.txt)
app.post("/api/admin/approve", async (req: Request, res: Response) => {
  const { id } = req.body || {};
  if (!id) {
    return res.status(400).json({ error: "Suggestion ID is required." });
  }

  try {
    const pending = await getPendingVocab();
    const target = pending.find((item) => item.id === id);
    if (!target) {
      return res.status(404).json({ error: "Pending suggestion not found." });
    }

    const prompt = await getPromptContent();
    const vocab = parseVocabulary(prompt);

    const existingIndex = vocab.findIndex(
      (v) => v.english.toLowerCase() === target.english.toLowerCase()
    );
    if (existingIndex >= 0) {
      vocab[existingIndex] = { english: target.english, sinhala: target.sinhala };
    } else {
      vocab.push({ english: target.english, sinhala: target.sinhala });
    }

    const updatedPrompt = updateVocabularyInPrompt(prompt, vocab);
    await savePromptContent(updatedPrompt);

    // Remove from pending
    const remaining = pending.filter((item) => item.id !== id);
    await savePendingVocab(remaining);

    return res.json({ success: true, vocabulary: vocab, pending: remaining });
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to approve suggestion." });
  }
});

// Admin: Reject a pending suggestion
app.post("/api/admin/reject", async (req: Request, res: Response) => {
  const { id } = req.body || {};
  if (!id) {
    return res.status(400).json({ error: "Suggestion ID is required." });
  }

  try {
    const pending = await getPendingVocab();
    const remaining = pending.filter((item) => item.id !== id);
    await savePendingVocab(remaining);
    return res.json({ success: true, pending: remaining });
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to reject suggestion." });
  }
});

// Admin: Direct add word
app.post("/api/admin/add", async (req: Request, res: Response) => {
  const { english, sinhala } = req.body || {};
  const eng = (english || "").trim();
  const sin = (sinhala || "").trim();

  if (!eng || !sin) {
    return res.status(400).json({ error: "Both English and Sinhala words are required." });
  }

  try {
    const prompt = await getPromptContent();
    const vocab = parseVocabulary(prompt);

    const existingIndex = vocab.findIndex(
      (v) => v.english.toLowerCase() === eng.toLowerCase()
    );
    if (existingIndex >= 0) {
      vocab[existingIndex] = { english: eng, sinhala: sin };
    } else {
      vocab.push({ english: eng, sinhala: sin });
    }

    const updatedPrompt = updateVocabularyInPrompt(prompt, vocab);
    await savePromptContent(updatedPrompt);

    return res.json({ success: true, vocabulary: vocab });
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to add word to prompt file." });
  }
});

// Admin: Direct delete word
app.delete("/api/admin/delete", async (req: Request, res: Response) => {
  const { english } = req.body || {};
  const eng = (english || "").trim();

  if (!eng) {
    return res.status(400).json({ error: "English word is required for deletion." });
  }

  try {
    const prompt = await getPromptContent();
    const vocab = parseVocabulary(prompt);

    const filtered = vocab.filter(
      (v) => v.english.toLowerCase() !== eng.toLowerCase()
    );

    const updatedPrompt = updateVocabularyInPrompt(prompt, filtered);
    await savePromptContent(updatedPrompt);

    return res.json({ success: true, vocabulary: filtered });
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to delete vocabulary from prompt file." });
  }
});


// Admin: Delete prompt history item
app.delete(["/api/admin/prompts/:id", "/api/admin/prompts/delete/:id"], async (req: Request, res: Response) => {
  try {
    const user = await getCurrentUser(req);
    if (!isUserAdminAccount(user, req)) {
      return res.status(403).json({ error: "Admin authentication required." });
    }

    const promptId = req.params.id || req.body?.id;
    if (!promptId) {
      return res.status(400).json({ error: "Prompt ID is required." });
    }

    await deletePromptHistoryItem(promptId);
    return res.json({ success: true, message: "Question generation record deleted successfully." });
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to delete question generation record." });
  }
});

app.post("/api/admin/prompts/delete", async (req: Request, res: Response) => {
  try {
    const user = await getCurrentUser(req);
    if (!isUserAdminAccount(user, req)) {
      return res.status(403).json({ error: "Admin authentication required." });
    }

    const { id } = req.body || {};
    if (!id) {
      return res.status(400).json({ error: "Prompt ID is required." });
    }

    await deletePromptHistoryItem(id);
    return res.json({ success: true, message: "Question generation record deleted successfully." });
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to delete question generation record." });
  }
});

// Admin: Get translation feature usage stats
app.get("/api/admin/translations", async (req: Request, res: Response) => {
  try {
    const user = await getCurrentUser(req);
    if (!isUserAdminAccount(user, req)) {
      return res.status(403).json({ error: "Admin authentication required." });
    }

    const stats = await getTranslationStats();
    return res.json(stats);
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to fetch translation usage stats." });
  }
});

// Admin: Get allowed Gemini models
app.get("/api/models", async (req: Request, res: Response) => {
  try {
    const models = await getAdminModels();
    return res.json({ models });
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch models." });
  }
});

// Admin: Add new Gemini model
app.post("/api/admin/models", async (req: Request, res: Response) => {
  try {
    const user = await getCurrentUser(req);
    if (!isUserAdminAccount(user, req)) {
      return res.status(403).json({ error: "Admin authentication required." });
    }

    const { model } = req.body || {};
    if (!model || typeof model !== "string" || !model.trim()) {
      return res.status(400).json({ error: "Model name is required." });
    }

    const updated = await addAdminModel(model.trim());
    return res.json({ success: true, models: updated });
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || "Failed to add model." });
  }
});

// Admin: Delete Gemini model
app.delete("/api/admin/models", async (req: Request, res: Response) => {
  try {
    const user = await getCurrentUser(req);
    if (!isUserAdminAccount(user, req)) {
      return res.status(403).json({ error: "Admin authentication required." });
    }

    const { model } = req.body || {};
    if (!model || typeof model !== "string" || !model.trim()) {
      return res.status(400).json({ error: "Model name is required." });
    }

    const updated = await deleteAdminModel(model.trim());
    return res.json({ success: true, models: updated });
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || "Failed to delete model." });
  }
});

app.post("/api/translate", async (req: Request, res: Response) => {
  const payload = req.body || {};
  const text = (payload.text || "").trim();
  const allowedModels = await getAdminModels();
  let model = (payload.model || "").trim();
  if (!model || !allowedModels.includes(model)) {
    model = allowedModels[0] || "gemini-3.6-flash";
  }

  if (!text) {
    return res.status(400).json({ error: "Please enter text to translate." });
  }

  // Identify user or guest
  const user = await getCurrentUser(req);
  let guestId: string | undefined = undefined;

  if (!user) {
    let existingGuestId = req.cookies?.guest_id || req.headers["x-guest-id"] || payload.guestId;
    if (existingGuestId && typeof existingGuestId === "string" && /^guest-\d+$/i.test(existingGuestId.trim())) {
      guestId = existingGuestId.trim().toLowerCase();
    } else {
      guestId = await getNextGuestIdentifier();
    }
    // Set guest_id cookie for persistence across unauthenticated sessions
    res.cookie("guest_id", guestId, {
      httpOnly: false,
      secure: true,
      sameSite: "none",
      maxAge: 365 * 24 * 60 * 60 * 1000,
    });
  }

  const userApiKey = (payload.apiKey || req.headers["x-api-key"] || "").toString().trim();

  try {
    const { unicodeText, legacyText } = await performTranslation(text, userApiKey, model);

    // Record translation usage stats
    try {
      await recordTranslation({
        userId: user?.id,
        userEmail: user?.email,
        userName: user?.name,
        isGuest: !user,
        guestIdentifier: guestId,
      });
    } catch (err) {
      console.error("Failed to record translation usage:", err);
    }

    let keyUsage: any = null;
    try {
      keyUsage = await incrementApiKeyUsage(userApiKey);
    } catch (err) {
      console.error("Failed to increment API key usage:", err);
    }

    return res.json({ translation: legacyText, unicode: unicodeText, guest_id: guestId, keyUsage });
  } catch (exc: any) {
    return res.status(502).json({ error: `The Gemini API request failed: ${exc?.message || exc}` });
  }
});

async function performTranslation(
  text: string,
  userApiKey?: string,
  model = "gemini-3.6-flash"
): Promise<{ unicodeText: string; legacyText: string }> {
  const apiKey = userApiKey || process.env.GEMINI_API_KEY_TRANSLATE || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("The server is missing its Gemini API configuration. Please enter a custom Gemini API key.");
  }

  let vocabListText = "";
  try {
    const promptContent = await getPromptContent();
    const vocab = parseVocabulary(promptContent);
    vocabListText = vocab.map((v) => `'${v.english}' as '${v.sinhala}'`).join(",\n");
  } catch {
    // Fallback if prompt file cannot be read
  }

  const translatorSystemPrompt = `Purpose and Goals:

* Translate any input provided by the user from English into Sinhala accurately and efficiently.
* Provide only the translated text as the output without any additional conversational filler, introductory phrases, explanations, or assistance with the content of the prompt.
* Consistently identify and use the correct Sinhala technical equivalents for IT-related terms, ensuring professional and academic accuracy.

Behaviors and Rules:

1) Strict Translation Mode:
 a) Upon receiving a prompt, immediately isolate the text intended for translation.
 b) Convert the text into Sinhala script (Unicode) using formal grammar and vocabulary.
 c) Output the Sinhala translation and nothing else. Prohibited phrases include 'Here is the translation', 'Translated text:', or 'How else can I help?'.
 d) If the user input is a question, do not answer it. Translate the question itself into Sinhala.
 e) dont include english terms withing brackets
 f) if a given word doesnt have a direct sinhala translated term, leave that word in english. i.e. GPU -> GPU, ICT -> ICT

2) Formatting and Terminology:
 a) Mirror the original formatting exactly, including line breaks, paragraphs, bullet points, and special characters.
 b) Use standard, high-level Sinhala syntax.

Mandatory Vocabulary Mapping: Always translate,
${vocabListText}

Apply this rigorous standard to all IT technical terms.

Overall Tone:

* Purely functional and robotic.
* Direct, concise, and utility-oriented.
* Non-conversational and devoid of personality or social pleasantries.

Text to translate:
${text}`;

  const ai = new GoogleGenAI({ apiKey });

  const validModels = await getAdminModels();
  const modelsToTry: string[] = [];

  if (model && validModels.includes(model)) {
    modelsToTry.push(model);
  }
  for (const m of validModels) {
    if (!modelsToTry.includes(m)) {
      modelsToTry.push(m);
    }
  }

  let unicodeTranslation = "";
  let lastError: any = null;

  for (const m of modelsToTry) {
    try {
      const response = await ai.models.generateContent({
        model: m,
        contents: translatorSystemPrompt,
      });
      unicodeTranslation = (response.text || "").trim();
      if (unicodeTranslation) {
        lastError = null;
        break;
      }
    } catch (err: any) {
      lastError = err;
      const msg = err?.message || String(err);
      console.warn(`Translation failed with model ${m} using ${userApiKey ? "custom" : "default"} API key:`, msg);

      if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED")) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  if (lastError && !unicodeTranslation) {
    throw new Error(`Gemini translation request failed: ${lastError?.message || lastError}`);
  }

  const legacyText = ConvertToLegacy(unicodeTranslation);
  return { unicodeText: unicodeTranslation, legacyText };
}

async function translateWithRetry(
  text: string,
  userApiKey?: string,
  maxRetries = 3
): Promise<{ unicodeText: string; legacyText: string }> {
  let lastErr: any = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await performTranslation(text, userApiKey);
      if (res && (res.legacyText || res.unicodeText)) {
        return res;
      }
    } catch (err: any) {
      lastErr = err;
      const msg = err?.message || String(err);
      if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED")) {
        await new Promise((r) => setTimeout(r, attempt * 1500));
      } else {
        await new Promise((r) => setTimeout(r, attempt * 400));
      }
    }
  }
  console.warn("Translation fallback for text:", text);
  const fallbackLegacy = ConvertToLegacy(text);
  return { unicodeText: text, legacyText: fallbackLegacy };
}

async function batchTranslateTexts(
  texts: string[],
  userApiKey?: string
): Promise<{ unicodeText: string; legacyText: string }[]> {
  if (texts.length === 0) return [];
  if (texts.length === 1) {
    const res = await translateWithRetry(texts[0], userApiKey);
    return [res];
  }

  let vocabListText = "";
  try {
    const promptContent = await getPromptContent();
    const vocab = parseVocabulary(promptContent);
    vocabListText = vocab.map((v) => `'${v.english}' as '${v.sinhala}'`).join(",\n");
  } catch {}

  const itemsFormatted = texts.map((t, idx) => `[ITEM ${idx + 1}]\n${t}`).join("\n\n");

  const prompt = `Translate each of the following items from English into Sinhala.
Translate accurately into Sinhala (Unicode).
Output ONLY the items in this exact marker format:
[ITEM 1]
<Sinhala translation for item 1>

[ITEM 2]
<Sinhala translation for item 2>

Do not add extra notes or conversational text. Preserve the [ITEM 1], [ITEM 2] markers.

Mandatory Vocabulary Mapping:
${vocabListText}

Items to translate:
${itemsFormatted}`;

  try {
    const { unicodeText } = await performTranslation(prompt, userApiKey);
    const itemRegex = /\[ITEM\s+(\d+)\]\s*([\s\S]*?)(?=\[ITEM\s+\d+\]|$)/gi;
    const parsedMap = new Map<number, string>();
    let match;
    while ((match = itemRegex.exec(unicodeText)) !== null) {
      const idx = parseInt(match[1], 10) - 1;
      const translated = match[2].trim();
      if (idx >= 0 && idx < texts.length) {
        parsedMap.set(idx, translated);
      }
    }

    const results: { unicodeText: string; legacyText: string }[] = [];
    for (let i = 0; i < texts.length; i++) {
      const trans = parsedMap.get(i);
      if (trans && trans.length > 0) {
        results.push({ unicodeText: trans, legacyText: ConvertToLegacy(trans) });
      } else {
        const single = await translateWithRetry(texts[i], userApiKey);
        results.push(single);
      }
    }
    return results;
  } catch (err) {
    console.warn("Batch translation request failed, processing individually:", err);
    const results: { unicodeText: string; legacyText: string }[] = [];
    for (const txt of texts) {
      const res = await translateWithRetry(txt, userApiKey);
      results.push(res);
      await new Promise((r) => setTimeout(r, 200));
    }
    return results;
  }
}

function getParagraphRawText(pNode: Element): string {
  let text = "";
  function walk(node: Node) {
    if (node.nodeType === 1) {
      const el = node as Element;
      const tag = (el.tagName || el.nodeName || "").toLowerCase();
      if (tag === "w:t" || tag === "t" || tag.endsWith(":t")) {
        text += el.textContent || "";
      } else if (
        tag === "w:br" ||
        tag === "br" ||
        tag.endsWith(":br") ||
        tag === "w:cr" ||
        tag === "cr" ||
        tag.endsWith(":cr")
      ) {
        text += "\n";
      } else if (tag === "w:tab" || tag === "tab" || tag.endsWith(":tab")) {
        text += " ";
      } else if (tag === "w:nobreakhyphen") {
        text += "-";
      } else {
        for (let i = 0; i < el.childNodes.length; i++) {
          walk(el.childNodes[i]);
        }
      }
    }
  }
  walk(pNode);
  return text;
}

function isInsideTableScope(pNode: Element): boolean {
  let curr: Node | null = pNode.parentNode;
  while (curr) {
    if (curr.nodeType === 1) {
      const tag = ((curr as Element).tagName || (curr as Element).nodeName || "").toLowerCase();
      if (tag === "w:tc" || tag === "tc" || tag.endsWith(":tc")) {
        return true;
      }
    }
    curr = curr.parentNode;
  }
  return false;
}

function insertAfter(parent: Node, newElem: Node, target: Node): Node {
  const next = target.nextSibling;
  if (next) {
    parent.insertBefore(newElem, next);
  } else {
    parent.appendChild(newElem);
  }
  return newElem;
}

function checkBoldElement(el: Element): boolean {
  const val = el.getAttribute("w:val") || el.getAttribute("val");
  if (val === "0" || val === "false" || val === "off") {
    return false;
  }
  return true;
}

function isParagraphBold(pNode: Element, origPPr?: Element | null): boolean {
  const checkList = (container: Element) => {
    const all = container.getElementsByTagName("*");
    for (let i = 0; i < all.length; i++) {
      const el = all[i];
      const tag = (el.tagName || el.nodeName || "").toLowerCase();
      if (tag === "w:b" || tag === "b" || tag.endsWith(":b") || tag === "w:bcs" || tag === "bcs" || tag.endsWith(":bcs")) {
        if (checkBoldElement(el)) return true;
      }
    }
    return false;
  };

  if (origPPr && checkList(origPPr)) {
    return true;
  }
  if (checkList(pNode)) {
    return true;
  }

  return false;
}

function createTextParagraph(
  doc: Document,
  text: string,
  origPPr?: Element | null,
  isBold: boolean = false
): Element {
  const p = doc.createElement("w:p");
  if (origPPr) {
    p.appendChild(origPPr.cloneNode(true));
  }
  const run = doc.createElement("w:r");
  if (isBold) {
    const rPr = doc.createElement("w:rPr");
    rPr.appendChild(doc.createElement("w:b"));
    rPr.appendChild(doc.createElement("w:bCs"));
    run.appendChild(rPr);
  }
  const tNode = doc.createElement("w:t");
  tNode.setAttribute("xml:space", "preserve");
  tNode.appendChild(doc.createTextNode(text));
  run.appendChild(tNode);
  p.appendChild(run);
  return p;
}

function createTranslatedParagraph(
  doc: Document,
  legacyText: string,
  origPPr?: Element | null,
  fontName: string = "4u-Chami.",
  isBold: boolean = false
): Element {
  const p = doc.createElement("w:p");
  if (origPPr) {
    p.appendChild(origPPr.cloneNode(true));
  }
  const run = doc.createElement("w:r");
  const rPr = doc.createElement("w:rPr");

  const rFonts = doc.createElement("w:rFonts");
  rFonts.setAttribute("w:ascii", fontName);
  rFonts.setAttribute("w:hAnsi", fontName);
  rFonts.setAttribute("w:cs", fontName);
  rFonts.setAttribute("w:eastAsia", fontName);
  rPr.appendChild(rFonts);

  if (isBold) {
    rPr.appendChild(doc.createElement("w:b"));
    rPr.appendChild(doc.createElement("w:bCs"));
  }

  run.appendChild(rPr);

  const lines = legacyText.split("\n");
  for (let l = 0; l < lines.length; l++) {
    if (l > 0) {
      run.appendChild(doc.createElement("w:br"));
    }
    const tNode = doc.createElement("w:t");
    tNode.setAttribute("xml:space", "preserve");
    tNode.appendChild(doc.createTextNode(lines[l]));
    run.appendChild(tNode);
  }

  p.appendChild(run);
  return p;
}

const docxUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

app.post("/api/translate-docx", docxUpload.single("file"), async (req: Request, res: Response) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: "Please select a valid .docx file to translate." });
    }

    const docxType = (req.body.docxType || req.body.docType || "question").toString().toLowerCase();
    const fontName = docxType === "tute" ? "FMMalithi" : "4u-Chami.";

    const userApiKey = (req.body.apiKey || req.headers["x-api-key"] || "").toString().trim();
    const apiKey = userApiKey || process.env.GEMINI_API_KEY_TRANSLATE || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(400).json({
        error: "The server is missing its Gemini API configuration. Please enter a custom Gemini API key.",
      });
    }

    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(req.file.buffer);
    } catch (err) {
      return res.status(400).json({ error: "Failed to parse the uploaded file as a valid .docx document." });
    }

    const docFile = zip.file("word/document.xml");
    if (!docFile) {
      return res.status(400).json({ error: "Could not locate word/document.xml inside the .docx file." });
    }

    const xmlContent = await docFile.async("text");
    const doc = new DOMParser().parseFromString(xmlContent, "text/xml");

    // Gather ALL paragraph elements in document order across the entire XML tree (including table cells w:tc)
    const allElements = Array.from(doc.getElementsByTagName("*"));
    const allParagraphs: Element[] = [];
    for (const el of allElements) {
      const tag = (el.tagName || el.nodeName || "").toLowerCase();
      if (tag === "w:p" || tag === "p" || tag.endsWith(":p")) {
        allParagraphs.push(el);
      }
    }

    // Work items map text segments (between line breaks) to their parent paragraph
    const workItems: { pNode: Element; lineIndex: number; totalLines: number; text: string; legacyTranslation?: string }[] = [];
    const pNodeLinesMap = new Map<Element, string[]>();

    for (const p of allParagraphs) {
      const rawText = getParagraphRawText(p);
      const lines = rawText
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      if (lines.length > 0) {
        pNodeLinesMap.set(p, lines);
        lines.forEach((lineText, idx) => {
          workItems.push({
            pNode: p,
            lineIndex: idx,
            totalLines: lines.length,
            text: lineText,
          });
        });
      }
    }

    if (workItems.length === 0) {
      return res.status(400).json({ error: "No text paragraphs or table cell lines found in the uploaded document." });
    }

    // Translate workItems in batches using batchTranslateTexts to minimize API calls and prevent rate limits
    const BATCH_SIZE = 10;
    for (let i = 0; i < workItems.length; i += BATCH_SIZE) {
      const batch = workItems.slice(i, i + BATCH_SIZE);
      const texts = batch.map((item) => item.text);
      try {
        const translations = await batchTranslateTexts(texts, userApiKey);
        for (let k = 0; k < batch.length; k++) {
          batch[k].legacyTranslation = translations[k]?.legacyText || ConvertToLegacy(batch[k].text);
        }
      } catch (err) {
        console.error("Batch error in DOCX translation:", err);
        for (const item of batch) {
          item.legacyTranslation = ConvertToLegacy(item.text);
        }
      }
      if (i + BATCH_SIZE < workItems.length) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    // Map translations back to each pNode
    const pNodeTranslationsMap = new Map<Element, string[]>();
    for (const item of workItems) {
      let arr = pNodeTranslationsMap.get(item.pNode);
      if (!arr) {
        arr = [];
        pNodeTranslationsMap.set(item.pNode, arr);
      }
      arr[item.lineIndex] = item.legacyTranslation || ConvertToLegacy(item.text);
    }

    // Insert translations directly below lines/paragraphs inside parent container (body, table cell w:tc, etc.)
    for (const [pNode, lines] of pNodeLinesMap.entries()) {
      const parent = pNode.parentNode;
      if (!parent) continue;

      const inTable = isInsideTableScope(pNode);
      const translations = pNodeTranslationsMap.get(pNode) || [];
      const origPPr = pNode.getElementsByTagName("w:pPr")[0] || pNode.getElementsByTagName("pPr")[0];
      const isBold = isParagraphBold(pNode, origPPr);

      if (lines.length === 1) {
        // Single line paragraph
        const transText = translations[0] || ConvertToLegacy(lines[0]);
        const transP = createTranslatedParagraph(doc, transText, origPPr, fontName, isBold);

        let last = insertAfter(parent, transP, pNode);
        if (!inTable) {
          const emptyP = doc.createElement("w:p");
          insertAfter(parent, emptyP, last);
        }
      } else {
        // Multi-line paragraph (separated by soft line breaks <w:br/>)
        // Replace pNode with individual paragraphs for each line + translation pair
        let lastInserted: Node = pNode;

        for (let i = 0; i < lines.length; i++) {
          const lineText = lines[i];
          const transText = translations[i] || ConvertToLegacy(lineText);

          const origLineP = createTextParagraph(doc, lineText, origPPr, isBold);
          const transP = createTranslatedParagraph(doc, transText, origPPr, fontName, isBold);

          lastInserted = insertAfter(parent, origLineP, lastInserted);
          lastInserted = insertAfter(parent, transP, lastInserted);

          if (!inTable) {
            const emptyP = doc.createElement("w:p");
            lastInserted = insertAfter(parent, emptyP, lastInserted);
          }
        }

        // Remove the original multi-line paragraph node to prevent duplication
        try {
          parent.removeChild(pNode);
        } catch (_) {}
      }
    }

    const serializer = new XMLSerializer();
    const newXml = serializer.serializeToString(doc);
    zip.file("word/document.xml", newXml);

    const outBuffer = await zip.generateAsync({ type: "nodebuffer" });

    // Track usage
    try {
      await incrementApiKeyUsage(userApiKey);
    } catch (_) {}

    const user = await getCurrentUser(req);
    try {
      await recordTranslation({
        userId: user?.id,
        userEmail: user?.email,
        userName: user?.name,
        isGuest: !user,
      });
    } catch (_) {}

    const originalFilename = req.file.originalname || "document.docx";
    const baseName = originalFilename.replace(/\.docx$/i, "");
    const outFilename = `${baseName}_translated.docx`;

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(outFilename)}"; filename*=${encodeURIComponent(outFilename)}`
    );

    return res.send(outBuffer);
  } catch (err: any) {
    console.error("Error in /api/translate-docx:", err);
    return res.status(500).json({ error: `DOCX translation failed: ${err?.message || err}` });
  }
});

app.get("/api/key-usage", async (req: Request, res: Response) => {
  const userApiKey = (req.query.apiKey || req.headers["x-api-key"] || "").toString().trim();
  try {
    const usage = await getApiKeyUsage(userApiKey);
    return res.json(usage);
  } catch (err) {
    return res.status(500).json({ error: "Failed to get API key usage." });
  }
});

app.post("/api/admin/key-usage", async (req: Request, res: Response) => {
  try {
    const user = await getCurrentUser(req);
    if (!isUserAdminAccount(user, req)) {
      return res.status(403).json({ error: "Admin authentication required." });
    }

    const { keyType, customApiKey, newCount } = req.body || {};
    const count = Math.max(0, parseInt(newCount, 10) || 0);

    const targetApiKey = keyType === "custom" ? (customApiKey || "").toString().trim() : "";
    const dateStr = new Date().toISOString().slice(0, 10);
    const keyInfo = getKeyIdentifier(targetApiKey);
    const compositeKey = `${dateStr}:${keyInfo.id}`;

    memoryApiKeyUsage[compositeKey] = count;
    await saveFallbackApiKeyUsage();

    if (isPostgresConfigured()) {
      try {
        await ensurePgTables();
        await sql`
          INSERT INTO api_key_usage (usage_date, key_id, request_count)
          VALUES (${dateStr}, ${keyInfo.id}, ${count})
          ON CONFLICT (usage_date, key_id)
          DO UPDATE SET request_count = ${count};
        `;
      } catch (err) {
        console.error("Error setting API key usage in Postgres:", err);
      }
    }

    const updatedUsage = await getApiKeyUsage(targetApiKey);
    return res.json({ success: true, usage: updatedUsage });
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to update API key usage." });
  }
});

app.get("/api/generate", (req: Request, res: Response) => {
  res.status(405).json({ error: "Use POST with a JSON body to generate a question." });
});

app.post("/api/generate", async (req: Request, res: Response) => {
  // Check user authentication
  const user = await getCurrentUser(req);
  if (!user) {
    return res.status(401).json({
      error: "Authentication required. Please sign in to generate MCQ questions.",
    });
  }

  const payload = req.body || {};
  const topic = (payload.topic || "").trim();
  const allowedModels = await getAdminModels();
  let model = (payload.model || "").trim();
  if (!model || !allowedModels.includes(model)) {
    model = allowedModels[0] || "gemini-3.6-flash";
  }
  const qtype = (payload.qtype || "normal").trim().toLowerCase();
  const userApiKey = (payload.apiKey || req.headers["x-api-key"] || "").toString().trim();

  if (!topic) {
    return res.status(400).json({ error: "Please enter a question topic." });
  }
  if (!model) {
    return res.status(400).json({ error: "Please select a Gemini model." });
  }
  if (!allowedModels.includes(model)) {
    return res.status(400).json({ error: `Invalid model '${model}'. Allowed models: ${allowedModels.join(", ")}` });
  }
  if (!VALID_TYPES.has(qtype)) {
    return res.status(400).json({ error: `Unknown question type '${qtype}'.` });
  }

  const apiKey = userApiKey || process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY_TRANSLATE;
  if (!apiKey) {
    return res.status(400).json({
      error:
        "Gemini API key is required. Please enter your Gemini API key in the form.",
    });
  }

  let prompt = "";
  try {
    prompt = await getPromptContent();
  } catch {
    return res.status(500).json({ error: "The prompt file is missing on the server." });
  }

  const questionTypeAndTopic = JSON.stringify({ topic, type: qtype });

  let responseText = "";
  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: model,
      contents: prompt + questionTypeAndTopic,
    });
    responseText = response.text || "";
  } catch (exc: any) {
    return res.status(502).json({ error: `The Gemini API request failed: ${exc?.message || exc}` });
  }

  let resdict: any;
  try {
    resdict = extractJson(responseText);
  } catch {
    return res.status(502).json({
      error:
        "The model didn't return valid JSON, so no document could be built. " +
        "Try again, or try a different model.",
    });
  }

  const resultQtype = String(resdict.QType || qtype).trim().toLowerCase();
  if (!VALID_TYPES.has(resultQtype)) {
    return res.status(502).json({ error: `The model returned an unknown QType: '${resultQtype}'.` });
  }

  // Record prompt history for the user
  try {
    await addPromptHistory({
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
      topic,
      qtype: resultQtype,
      model,
    });
  } catch (err) {
    console.error("Failed to record prompt history:", err);
  }

  // If client requested raw JSON (e.g., in multi-question mode)
  if (payload.returnJson) {
    try {
      await incrementApiKeyUsage(userApiKey);
    } catch (_) {}
    return res.json({
      success: true,
      resdict,
      qtype: resultQtype,
      topic,
    });
  }

  try {
    const replacements = buildReplacements(resdict, resultQtype);
    const templatePath = TEMPLATE_FILES[resultQtype];
    const docxBuffer = await findAndReplaceInDocx(templatePath, replacements);

    let filename = (payload.filename || "").toString().trim();
    if (!filename) {
      const timestamp = new Date()
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\..+/, "")
        .replace("T", "_");
      const safeTopic =
        topic.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "MCQ";
      filename = `${safeTopic}_${resultQtype}_${timestamp}.docx`;
    } else if (!filename.toLowerCase().endsWith(".docx")) {
      filename += ".docx";
    }

    const safeFilename = filename.replace(/[/\\?%*:|"<>]/g, "_");

    try {
      await incrementApiKeyUsage(userApiKey);
    } catch (err) {
      console.error("Failed to increment API key usage in generate:", err);
    }

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(safeFilename)}"; filename*=${encodeURIComponent(safeFilename)}`
    );
    return res.send(docxBuffer);
  } catch (exc: any) {
    return res.status(500).json({ error: `Failed to build the document: ${exc?.message || exc}` });
  }
});

async function buildMultiQuestionDocxBuffer(
  questions: Array<{ resdict: any; qtype: string; topic?: string }>
): Promise<Buffer> {
  if (!questions || questions.length === 0) {
    throw new Error("No questions provided.");
  }

  const domParser = new DOMParser();
  const xmlSerializer = new XMLSerializer();

  const firstQ = questions[0];
  const firstQType = firstQ.qtype || "normal";
  const firstTemplatePath = TEMPLATE_FILES[firstQType] || TEMPLATE_FILES.normal;
  const firstContent = await fs.promises.readFile(firstTemplatePath);
  const masterZip = await JSZip.loadAsync(firstContent);

  const allQuestionBodyNodes: Node[] = [];

  for (let idx = 0; idx < questions.length; idx++) {
    const q = questions[idx];
    const qtype = q.qtype || "normal";
    const templatePath = TEMPLATE_FILES[qtype] || TEMPLATE_FILES.normal;
    const replacements = buildReplacements(q.resdict, qtype);

    const tContent = await fs.promises.readFile(templatePath);
    const tZip = await JSZip.loadAsync(tContent);
    const docFile = tZip.file("word/document.xml");
    if (!docFile) continue;

    const xmlText = await docFile.async("string");
    const doc = domParser.parseFromString(xmlText, "text/xml");

    const paragraphs = doc.getElementsByTagName("w:p");
    for (let i = 0; i < paragraphs.length; i++) {
      const p = paragraphs.item(i);
      if (!p) continue;

      const tElementsLive = p.getElementsByTagName("w:t");
      if (!tElementsLive || tElementsLive.length === 0) continue;

      const tElements: Element[] = [];
      for (let j = 0; j < tElementsLive.length; j++) {
        tElements.push(tElementsLive.item(j)!);
      }

      let pText = "";
      for (const t of tElements) pText += t.textContent || "";

      let hasMatch = false;
      for (const oldKey of Object.keys(replacements)) {
        if (pText.includes(oldKey)) {
          hasMatch = true;
          break;
        }
      }
      if (!hasMatch) continue;

      for (const [oldKey, newVal] of Object.entries(replacements)) {
        if (typeof newVal === "string") {
          pText = pText.split(oldKey).join(newVal);
        }
      }

      let segmentKey: string | null = null;
      let segments: TextSegment[] | null = null;
      for (const [oldKey, newVal] of Object.entries(replacements)) {
        if (Array.isArray(newVal) && pText.includes(oldKey)) {
          segmentKey = oldKey;
          segments = newVal;
          break;
        }
      }

      const firstT = tElements[0];
      const firstRun = firstT.parentNode as Element;

      if (segments && segmentKey) {
        const paragraphEl = firstRun.parentNode as Element;
        const templateRPr = firstRun.getElementsByTagName("w:rPr").item(0) ?? null;

        const pos = pText.indexOf(segmentKey);
        const before = pText.slice(0, pos);
        const after = pText.slice(pos + segmentKey.length);

        const newRuns: Element[] = [];
        if (before) newRuns.push(buildRun(doc, templateRPr, before, false));
        for (const seg of segments) {
          newRuns.push(buildRun(doc, templateRPr, seg.text, seg.isEnglish));
        }
        if (after) newRuns.push(buildRun(doc, templateRPr, after, false));

        for (const r of newRuns) paragraphEl.insertBefore(r, firstRun);
        paragraphEl.removeChild(firstRun);
      } else if (pText.includes("\n")) {
        const parent = firstT.parentNode;
        if (parent) {
          const lines = pText.split("\n");
          for (let l = 0; l < lines.length; l++) {
            if (l > 0) {
              parent.insertBefore(doc.createElementNS(WORD_NS, "w:br"), firstT);
            }
            const tNode = doc.createElementNS(WORD_NS, "w:t");
            if (lines[l].startsWith(" ") || lines[l].endsWith(" ")) {
              tNode.setAttribute("xml:space", "preserve");
            }
            tNode.textContent = lines[l];
            parent.insertBefore(tNode, firstT);
          }
          parent.removeChild(firstT);
        }
      } else {
        if (pText.startsWith(" ") || pText.endsWith(" ")) {
          firstT.setAttribute("xml:space", "preserve");
        }
        firstT.textContent = pText;
      }

      for (let j = 1; j < tElements.length; j++) {
        tElements[j].textContent = "";
      }
    }

    const bodyList = doc.getElementsByTagName("w:body");
    if (bodyList.length > 0) {
      const body = bodyList.item(0)!;
      const childNodes = Array.from(body.childNodes);
      for (const node of childNodes) {
        if (node.nodeType === 1) {
          const tag = ((node as Element).tagName || (node as Element).nodeName || "").toLowerCase();
          if (tag === "w:sectpr" || tag === "sectpr" || tag.endsWith(":sectpr")) {
            continue;
          }
        }
        allQuestionBodyNodes.push(node);
      }


    }
  }

  const masterDocFile = masterZip.file("word/document.xml");
  if (!masterDocFile) throw new Error("Could not locate word/document.xml in template.");

  const masterXmlText = await masterDocFile.async("string");
  const masterDoc = domParser.parseFromString(masterXmlText, "text/xml");
  const masterBody = masterDoc.getElementsByTagName("w:body").item(0);

  if (!masterBody) throw new Error("Master w:body element not found.");

  let sectPrNode: Node | null = null;
  const masterChildren = Array.from(masterBody.childNodes);
  for (const child of masterChildren) {
    if (child.nodeType === 1) {
      const tag = ((child as Element).tagName || (child as Element).nodeName || "").toLowerCase();
      if (tag === "w:sectpr" || tag === "sectpr" || tag.endsWith(":sectpr")) {
        sectPrNode = child;
      }
    }
    masterBody.removeChild(child);
  }

  for (const node of allQuestionBodyNodes) {
    const importedNode = masterDoc.importNode(node, true);
    masterBody.appendChild(importedNode);
  }

  if (sectPrNode) {
    masterBody.appendChild(sectPrNode);
  }

  const updatedXml = xmlSerializer.serializeToString(masterDoc);
  masterZip.file("word/document.xml", updatedXml);

  return await masterZip.generateAsync({ type: "nodebuffer" });
}

app.post("/api/generate-multi-docx", async (req: Request, res: Response) => {
  const user = await getCurrentUser(req);
  if (!user) {
    return res.status(401).json({
      error: "Authentication required. Please sign in to download generated MCQ documents.",
    });
  }

  const { questions, filename: customFilename, apiKey: userApiKey } = req.body || {};
  if (!Array.isArray(questions) || questions.length === 0) {
    return res.status(400).json({ error: "Please add at least one question to the document." });
  }

  try {
    const docxBuffer = await buildMultiQuestionDocxBuffer(questions);

    let filename = (customFilename || "").toString().trim();
    if (!filename) {
      filename = `MCQ_Document_${questions.length}_Questions.docx`;
    }
    if (!filename.toLowerCase().endsWith(".docx")) {
      filename += ".docx";
    }

    const safeFilename = filename.replace(/[/\\?%*:|"<>]/g, "_");

    try {
      await incrementApiKeyUsage(userApiKey);
    } catch (_) {}

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(safeFilename)}"; filename*=${encodeURIComponent(safeFilename)}`
    );
    return res.send(docxBuffer);
  } catch (err: any) {
    console.error("Error building multi-question docx:", err);
    return res.status(500).json({ error: `Failed to build multi-question document: ${err?.message || err}` });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});

export default app;
