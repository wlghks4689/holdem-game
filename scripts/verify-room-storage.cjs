// Isolated regression test: actual KV SDK and route handlers, mock Redis REST transport.
// No external credentials, network, or persistent test rooms are used.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");
require.extensions[".ts"] = (module, filename) => {
  const source = fs.readFileSync(filename, "utf8");
  module._compile(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  }).outputText, filename);
};
const resolve = Module._resolveFilename;
Module._resolveFilename = function (name, ...args) {
  return resolve.call(this, name.startsWith("@/") ? path.join(root, "src", name.slice(2)) : name, ...args);
};
const { resolveRoomStorageConfig: config, RoomStorageConfigError, roomStorageFailure } = require("../src/server/roomStorageConfig.ts");
const endpoint = "https://room-storage-test.invalid";
assert.equal(config({}).kind, "memory");
assert.throws(() => config({ VERCEL: "1" }), RoomStorageConfigError);
assert.throws(() => config({ REDIS_URL: "https://wrong.invalid" }), RoomStorageConfigError);
assert.equal(config({ KV_URL: "rediss://localhost:6379" }).kind, "redis");
assert.equal(config({ STORAGE_URL: "postgres://localhost/db", KV_REST_API_URL: endpoint, KV_REST_API_TOKEN: "test-token" }).kind, "rest");
assert.throws(() => config({ KV_REST_API_URL: endpoint, UPSTASH_REDIS_REST_TOKEN: "wrong-pair" }), RoomStorageConfigError);
assert.equal(config({ HOLDEM_LIMIT_GAME_REST_API_URL: endpoint, HOLDEM_LIMIT_GAME_REST_API_TOKEN: "test-token" }).kind, "rest");
assert.equal(config({ REDIS_URL: "redis://localhost:6379", KV_REST_API_URL: endpoint, KV_REST_API_TOKEN: "test-token" }).kind, "redis");
assert.equal(roomStorageFailure(new Error("WRONGPASS secret-url")).code, "ROOM_STORAGE_AUTH");
assert.equal(roomStorageFailure(new Error("NOPERM secret-token")).code, "ROOM_STORAGE_PERMISSION");
assert.equal(roomStorageFailure(new Error("getaddrinfo ENOTFOUND retired.invalid")).code, "ROOM_STORAGE_DNS");
assert.ok(!JSON.stringify(roomStorageFailure(new Error("secret-token"))).includes("secret-token"));

for (const name of Object.keys(process.env)) {
  if (/REDIS|^KV_|^STORAGE_|^HOLDEM_LIMIT_GAME_/.test(name)) delete process.env[name];
}
process.env.VERCEL = "1";
process.env.KV_REST_API_URL = endpoint;
process.env.KV_REST_API_TOKEN = "test-token";
const data = new Map();
const lobby = new Set();
const ttls = [];
let denyWrites = false;
function command([op, key, ...args]) {
  if (denyWrites && op.toLowerCase() === "set") return { error: "NOPERM test-only" };
  let result;
  switch (op.toLowerCase()) {
    case "set":
      data.set(key, args[0]);
      assert.equal(String(args[1]).toLowerCase(), "ex");
      ttls.push(args[2]);
      result = "OK";
      break;
    case "get": result = data.get(key) ?? null; break;
    case "sadd": args.forEach((id) => lobby.add(id)); result = 1; break;
    case "srem": args.forEach((id) => lobby.delete(id)); result = 1; break;
    case "smembers": result = [...lobby]; break;
    default: throw new Error(`Unexpected command: ${op}`);
  }
  const encode = (value) => typeof value === "string" ? Buffer.from(value).toString("base64") : Array.isArray(value) ? value.map(encode) : value;
  return { result: encode(result) };
}
global.fetch = async (url, init) => {
  assert.equal(new URL(url).origin, endpoint, "No real network calls allowed");
  const body = JSON.parse(init.body);
  const result = Array.isArray(body[0]) ? body.map(command) : command(body);
  return new Response(JSON.stringify(result), { status: 200 });
};
const store = require("../src/server/roomStore.ts");
const create = require("../src/app/api/room/create/route.ts").POST;
const join = require("../src/app/api/room/[roomId]/join/route.ts").POST;
const read = require("../src/app/api/room/[roomId]/route.ts").GET;
const action = require("../src/app/api/room/[roomId]/action/route.ts").POST;
const leave = require("../src/app/api/room/[roomId]/leave/route.ts").POST;
function request(body) {
  return new Request("http://localhost/api/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
async function json(response, status = 200) {
  assert.equal(response.status, status);
  return response.json();
}
async function scenario(gameMode, isPublic) {
  const host = await json(await create(request({ public: isPublic, hostNickname: "Storage test", gameMode })));
  const ctx = { params: Promise.resolve({ roomId: host.roomId }) };
  assert.equal((await store.lobbyList()).some((room) => room.roomId === host.roomId), isPublic);
  const guest = await json(await join(request({}), ctx));
  assert.equal((await store.lobbyList()).some((room) => room.roomId === host.roomId), false);
  await json(await join(request({}), ctx), 409);
  const roomUrl = (seat, token) => `http://localhost/api/room/${host.roomId}?seat=${seat}&token=${token}`;
  const state0 = await json(await read(new Request(roomUrl(0, host.token)), ctx));
  assert.equal(state0.guestJoined, true);
  assert.equal(state0.state.gameMode, gameMode);
  await json(await read(new Request(roomUrl(0, "invalid-token")), ctx), 403);
  await json(await action(request({ seat: 1, token: guest.token, stateVersion: state0.stateVersion, action: { type: "START_GAME" } }), ctx), 403);
  const started = await json(await action(request({ seat: 0, token: host.token, stateVersion: state0.stateVersion, action: { type: "START_GAME" } }), ctx));
  assert.notEqual(started.state.phase, "lobby");
  const guestState = await json(await read(new Request(roomUrl(1, guest.token)), ctx));
  assert.equal(guestState.stateVersion, started.stateVersion);
  assert.equal(guestState.state.phase, started.state.phase);
  await json(await leave(request({ seat: 1, token: guest.token }), ctx));
  const afterLeave = await json(await read(new Request(roomUrl(0, host.token)), ctx));
  assert.equal(afterLeave.opponentLeft, true);
  return host.roomId;
}
async function main() {
  const sampleId = await scenario("classic", true);
  await scenario("cost", false);
  const blob = await store.roomGet(sampleId);
  await store.roomSet("12345678", { ...blob, tokens: ["test-host-token", null], public: true, disconnected: [false, false] });
  await store.lobbyAdd("12345678");
  assert.equal((await store.lobbyList())[0].roomId, "12345678", "Numeric hex IDs must stay strings");
  assert.ok(ttls.every((ttl) => ttl === 60 * 60 * 72));
  // Demonstrate the old parser failure with the SDK's default behavior.
  const legacyClient = require("@vercel/kv").createClient({ url: endpoint, token: "test-token" });
  const legacyValue = await legacyClient.get(`holdem:room:${sampleId}`);
  assert.equal(typeof legacyValue, "object");
  assert.throws(() => JSON.parse(legacyValue));
  denyWrites = true;
  const failure = await json(await create(request({})), 503);
  assert.equal(failure.code, "ROOM_STORAGE_PERMISSION");
  denyWrites = false;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  await assert.rejects(store.roomGet(sampleId), RoomStorageConfigError);
  assert.equal((await json(await create(request({})), 503)).code, "ROOM_STORAGE_CONFIG");
  delete process.env.VERCEL;
  await scenario("classic", true);
  console.log("PASS: config, KV JSON regression, numeric room IDs, TTL, public/private rooms, two-seat auth, game start/sync/leave, safe storage errors, local memory.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
