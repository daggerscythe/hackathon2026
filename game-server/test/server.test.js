import { afterAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { createGameServer } from '../src/server.js';
import { encode, MsgType } from '@hack/shared';

function waitFor(ws, type) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout waiting for ' + type)), 2000);
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString('utf8'));
      if (msg.type === type) {
        clearTimeout(t);
        resolve(msg);
      }
    });
  });
}

async function openAndJoin(port, name) {
  const ws = new WebSocket(`ws://localhost:${port}`);
  await new Promise((r) => ws.once('open', r));
  ws.send(encode({ type: MsgType.JOIN, name }));
  const welcome = await waitFor(ws, MsgType.WELCOME);
  return { ws, welcome };
}

describe('game-server lobby', () => {
  const port = 8099;
  const server = createGameServer({ port });

  afterAll(async () => {
    await server.close();
  });

  it('welcomes a joining player', async () => {
    const { ws, welcome } = await openAndJoin(port, 'Alice');
    expect(welcome.playerId).toBeTruthy();
    expect(['hero', 'villain', 'spectator']).toContain(welcome.role);

    ws.close();
  });

  it('starts match when host starts and all 4 are ready', async () => {
    const a = await openAndJoin(port, 'A');
    const b = await openAndJoin(port, 'B');
    const c = await openAndJoin(port, 'C');
    const d = await openAndJoin(port, 'D');

    const hostId = a.welcome.lobby?.hostId;
    expect(hostId).toBeTruthy();

    a.ws.send(encode({ type: MsgType.READY, ready: true }));
    b.ws.send(encode({ type: MsgType.READY, ready: true }));
    c.ws.send(encode({ type: MsgType.READY, ready: true }));
    d.ws.send(encode({ type: MsgType.READY, ready: true }));

    const hostWs = a.welcome.playerId === hostId ? a.ws : b.welcome.playerId === hostId ? b.ws : c.welcome.playerId === hostId ? c.ws : d.ws;
    hostWs.send(encode({ type: MsgType.START }));

    const msgA = await waitFor(a.ws, MsgType.MATCH_START);
    const msgB = await waitFor(b.ws, MsgType.MATCH_START);
    const msgC = await waitFor(c.ws, MsgType.MATCH_START);
    const msgD = await waitFor(d.ws, MsgType.MATCH_START);

    expect(msgA.seed).toEqual(expect.any(Number));
    expect(Array.isArray(msgA.spawns)).toBe(true);
    expect(msgB.type).toBe(MsgType.MATCH_START);
    expect(msgC.type).toBe(MsgType.MATCH_START);
    expect(msgD.type).toBe(MsgType.MATCH_START);

    a.ws.close();
    b.ws.close();
    c.ws.close();
    d.ws.close();
  });
});
