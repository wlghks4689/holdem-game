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
const lobby = new Map();
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
    case "del": result = data.delete(key) ? 1 : 0; break;
    case "expire": assert.equal(args[0], 1800); result = 1; break;
    case "zadd": lobby.set(args[1], Number(args[0])); result = 1; break;
    case "zrem": args.forEach((id) => lobby.delete(id)); result = 1; break;
    case "zremrangebyscore":
      for (const [id, deadline] of lobby) if (deadline <= Number(args[1])) lobby.delete(id);
      result = 1; break;
    case "zrange": result = [...lobby.keys()]; break;
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
const rematch = require("../src/app/api/room/[roomId]/rematch/route.ts").POST;
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
  assert.ok(ttls.includes(600) && ttls.includes(1800) && ttls.includes(60));
  assert.ok(ttls.every((ttl) => ttl > 0 && ttl <= 1800));
  // Demonstrate the old parser failure with the SDK's default behavior.
  const legacyClient = require("@vercel/kv").createClient({ url: endpoint, token: "test-token" });
  const legacyValue = await legacyClient.get(`holdem:room:${sampleId}`);
  assert.equal(typeof legacyValue, "object");
  assert.throws(() => JSON.parse(legacyValue));
  await verifyLifetime();
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
  await verifyLifetime();
  verifyHellUnlock();
  console.log("PASS: storage config/serialization, two-player flow, temporary room expiry/deletion/rematch (REST and memory), hard-5 hell unlock.");
}

async function verifyLifetime() {
  const originalNow = Date.now;
  let now = originalNow();
  Date.now = () => now;
  try {
    // A waiting room expires even if a client keeps polling it.
    const waiting = await json(await create(request({ public: true })));
    const initial = await store.roomGet(waiting.roomId);
    assert.equal(initial.expiresAt, now + 600_000);
    now += 599_000;
    assert.equal((await store.roomGet(waiting.roomId)).expiresAt, initial.expiresAt);
    now += 1000;
    assert.equal(await store.roomGet(waiting.roomId), null);
    assert.equal((await store.lobbyList()).some((r) => r.roomId === waiting.roomId), false);

    const cancelled = await json(await create(request({ public: true })));
    await json(await leave(request({ seat: 0, token: cancelled.token }), { params: Promise.resolve({ roomId: cancelled.roomId }) }));
    assert.equal(await store.roomGet(cancelled.roomId), null);

    const host = await json(await create(request({ gameMode: "cost" })));
    const ctx = { params: Promise.resolve({ roomId: host.roomId }) };
    const guest = await json(await join(request({}), ctx));
    await json(await rematch(request({ seat: 0, token: host.token, cmd: "accept" }), ctx), 409);
    const game = await store.roomGet(host.roomId);
    game.state.phase = "hand_over";
    game.state.matchEnded = true;
    game.state.matchWinner = 0;
    await store.roomSet(host.roomId, game);
    const finishedDeadline = now + 300_000;
    assert.equal((await store.roomGet(host.roomId)).expiresAt, finishedDeadline);
    now += 60_000;
    await json(await rematch(request({ seat: 0, token: host.token, cmd: "accept" }), ctx));
    assert.equal((await store.roomGet(host.roomId)).expiresAt, finishedDeadline);
    await json(await rematch(request({ seat: 1, token: guest.token, cmd: "accept" }), ctx));
    const restarted = await store.roomGet(host.roomId);
    assert.equal(restarted.state.matchEnded, false);
    assert.equal(restarted.state.gameMode, "cost");
    assert.equal(restarted.cleanupDeadline, undefined);
    assert.equal(restarted.expiresAt, now + 1800_000);
    await json(await leave(request({ seat: 1, token: guest.token }), ctx));
    const leftDeadline = now + 60_000;
    now += 15_000;
    await json(await leave(request({ seat: 1, token: guest.token }), ctx));
    assert.equal((await store.roomGet(host.roomId)).expiresAt, leftDeadline);
    await json(await rematch(request({ seat: 0, token: host.token, cmd: "accept" }), ctx), 409);
    await json(await leave(request({ seat: 0, token: host.token }), ctx));
    assert.equal(await store.roomGet(host.roomId), null);

    // A closed browser sends no leave request: idle expiry is the safety net.
    const idle = await json(await create(request({})));
    const idleBlob = await store.roomGet(idle.roomId);
    idleBlob.state.phase = "hand_select";
    await store.roomSet(idle.roomId, idleBlob);
    now += 1800_000;
    assert.equal(await store.roomGet(idle.roomId), null);
  } finally { Date.now = originalNow; }
}

function verifyHellUnlock() {
  process.env.NODE_ENV = "production";
  delete process.env.NEXT_PUBLIC_HOLDEM_DEV_UNLOCK_HELL;
  let savedWins = "4";
  global.window = { localStorage: { getItem: () => savedWins, setItem: (_key, value) => { savedWins = value; } }, dispatchEvent() {} };
  const progress = require("../src/holdem/singlePlayerProgress.ts");
  assert.equal(progress.isHellModeUnlocked(), false);
  progress.recordHardModeMatchWin();
  assert.equal(progress.getHardModeMatchWins(), 5);
  assert.equal(progress.isHellModeUnlocked(), true);
  savedWins = "10";
  assert.equal(progress.isHellModeUnlocked(), true);
  delete global.window;
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
