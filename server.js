#!/usr/bin/env node
const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = __dirname;
const ROOM_TTL_MS = 1000 * 60 * 60 * 6;
const rooms = new Map();

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".png": "image/png",
  ".txt": "text/plain; charset=utf-8",
};

function generateInviteCode() {
  return crypto.randomBytes(4).toString("base64url").replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 8);
}

function cleanCode(value) {
  return String(value || "").replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 12);
}

function sendCors(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(response, status, payload) {
  sendCors(response);
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        request.destroy();
        reject(new Error("Payload muito grande"));
      }
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("JSON invalido"));
      }
    });
    request.on("error", reject);
  });
}

function publicRoom(room) {
  return {
    code: room.code,
    players: room.players.map((player) => ({
      playerId: player.playerId,
      slot: player.slot,
      characterId: player.characterId,
      connected: player.connected,
    })),
  };
}

function getRoom(code) {
  const roomCode = cleanCode(code);
  if (!roomCode || roomCode.length < 4) return null;
  if (!rooms.has(roomCode)) {
    rooms.set(roomCode, {
      code: roomCode,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      players: [],
      streams: new Map(),
      lastSnapshot: null,
    });
  }
  const room = rooms.get(roomCode);
  room.updatedAt = Date.now();
  return room;
}

function writeEvent(response, event, data) {
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(data)}\n\n`);
}

function broadcast(room, event, data) {
  for (const response of room.streams.values()) {
    writeEvent(response, event, data);
  }
}

function upsertPlayer(room, playerId, characterId) {
  let player = room.players.find((item) => item.playerId === playerId);
  if (!player) {
    if (room.players.length >= 2) return null;
    player = {
      playerId,
      slot: room.players.some((item) => item.slot === 1) ? 2 : 1,
      characterId,
      connected: true,
    };
    room.players.push(player);
  }
  player.characterId = characterId || player.characterId;
  player.connected = true;
  room.updatedAt = Date.now();
  return player;
}

async function handleJoin(request, response) {
  const body = await readJson(request);
  const room = getRoom(body.code);
  if (!room) return sendJson(response, 400, { error: "Convite invalido" });
  const playerId = String(body.playerId || "").slice(0, 80);
  const characterId = String(body.characterId || "codex").slice(0, 40);
  if (!playerId) return sendJson(response, 400, { error: "Jogador invalido" });
  const player = upsertPlayer(room, playerId, characterId);
  if (!player) return sendJson(response, 409, { error: "Sala cheia" });
  const payload = { slot: player.slot, room: publicRoom(room) };
  sendJson(response, 200, payload);
  broadcast(room, "room", publicRoom(room));
}

async function handleInput(request, response) {
  const body = await readJson(request);
  const room = getRoom(body.code);
  if (!room) return sendJson(response, 404, { error: "Sala nao encontrada" });
  const player = room.players.find((item) => item.playerId === body.playerId);
  if (!player) return sendJson(response, 403, { error: "Jogador fora da sala" });
  const keys = Array.isArray(body.keys) ? body.keys.map(String).slice(0, 12) : [];
  broadcast(room, "input", { playerId: player.playerId, slot: player.slot, keys });
  sendJson(response, 200, { ok: true });
}

async function handleSnapshot(request, response) {
  const body = await readJson(request);
  const room = getRoom(body.code);
  if (!room) return sendJson(response, 404, { error: "Sala nao encontrada" });
  const player = room.players.find((item) => item.playerId === body.playerId);
  if (!player || player.slot !== 1) return sendJson(response, 403, { error: "Apenas host envia snapshot" });
  room.lastSnapshot = body.snapshot;
  broadcast(room, "snapshot", body.snapshot);
  sendJson(response, 200, { ok: true });
}

async function handleRestart(request, response) {
  const body = await readJson(request);
  const room = getRoom(body.code);
  if (!room) return sendJson(response, 404, { error: "Sala nao encontrada" });
  const player = room.players.find((item) => item.playerId === body.playerId);
  if (!player || player.slot !== 1) return sendJson(response, 403, { error: "Apenas host reinicia" });
  broadcast(room, "restart", { at: Date.now() });
  sendJson(response, 200, { ok: true });
}

function handleEvents(request, response, url) {
  const code = cleanCode(url.searchParams.get("code"));
  const playerId = String(url.searchParams.get("playerId") || "").slice(0, 80);
  const room = getRoom(code);
  if (!room || !playerId) {
    sendJson(response, 400, { error: "Evento invalido" });
    return;
  }
  sendCors(response);
  response.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });
  room.streams.set(playerId, response);
  const player = room.players.find((item) => item.playerId === playerId);
  if (player) player.connected = true;
  writeEvent(response, "room", publicRoom(room));
  if (room.lastSnapshot) writeEvent(response, "snapshot", room.lastSnapshot);
  broadcast(room, "room", publicRoom(room));
  request.on("close", () => {
    room.streams.delete(playerId);
    const current = room.players.find((item) => item.playerId === playerId);
    if (current) current.connected = false;
    broadcast(room, "room", publicRoom(room));
  });
}

function serveStatic(request, response, url) {
  const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  if (pathname.includes("..") || pathname.startsWith("/.git") || pathname.startsWith("/.vercel")) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }
  const filePath = path.join(PUBLIC_DIR, pathname);
  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    response.writeHead(200, { "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream" });
    response.end(data);
  });
}

function cleanupRooms() {
  const now = Date.now();
  for (const [code, room] of rooms.entries()) {
    if (room.streams.size === 0 && now - room.updatedAt > ROOM_TTL_MS) rooms.delete(code);
  }
}

function createServer() {
  return http.createServer(async (request, response) => {
    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    if (request.method === "OPTIONS") {
      sendCors(response);
      response.writeHead(204);
      response.end();
      return;
    }
    try {
      if (request.method === "POST" && url.pathname === "/api/join") return await handleJoin(request, response);
      if (request.method === "POST" && url.pathname === "/api/input") return await handleInput(request, response);
      if (request.method === "POST" && url.pathname === "/api/snapshot") return await handleSnapshot(request, response);
      if (request.method === "POST" && url.pathname === "/api/restart") return await handleRestart(request, response);
      if (request.method === "GET" && url.pathname === "/api/events") return handleEvents(request, response, url);
      if (request.method === "GET") return serveStatic(request, response, url);
      sendJson(response, 405, { error: "Metodo nao permitido" });
    } catch (error) {
      sendJson(response, 500, { error: error instanceof Error ? error.message : "Erro interno" });
    }
  });
}

function printInvite() {
  const code = generateInviteCode();
  const hostArgIndex = process.argv.indexOf("--host");
  const host = hostArgIndex >= 0 ? process.argv[hostArgIndex + 1] : process.env.PUBLIC_URL || `http://localhost:${PORT}`;
  const url = new URL(host);
  url.searchParams.set("invite", code);
  console.log(`Convite: ${code}`);
  console.log(`URL: ${url.toString()}`);
}

if (process.argv[2] === "invite") {
  printInvite();
} else {
  setInterval(cleanupRooms, 1000 * 60 * 15).unref();
  createServer().listen(PORT, () => {
    console.log(`IDE Kombat multiplayer on http://localhost:${PORT}`);
    console.log("Gerar convite: node server.js invite");
  });
}
