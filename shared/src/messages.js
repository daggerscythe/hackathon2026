// Shared message protocol between client and server.
// Keep it small and JSON-friendly.

/**
 * @typedef {{type:'join', name:string}} JoinMsg
 * @typedef {{type:'ready', ready:boolean}} ReadyMsg
 * @typedef {{type:'start'}} StartMsg
 * @typedef {{type:'welcome', playerId:string, role:string, lobby: LobbyState, hostUrls?: string[]}} WelcomeMsg
 * @typedef {{type:'lobby', lobby: LobbyState}} LobbyMsg
 * @typedef {{type:'input', seq:number, buttons:{jump?:boolean}, axis:{x:number, z:number}}} InputMsg
 * @typedef {{type:'match_start', seed:number, spawns: Array<{id:string, x:number, z:number}>}} MatchStartMsg
 * @typedef {{type:'error', message:string}} ErrorMsg
 *
 * @typedef {{
 *   players: Array<{ id:string, name:string, role:string, ready?: boolean }>,
 *   maxPlayers: number
 *   hostId?: string
 *   matchStarted?: boolean
 * }} LobbyState
 *
 * @typedef {JoinMsg|ReadyMsg|StartMsg|WelcomeMsg|LobbyMsg|InputMsg|MatchStartMsg|ErrorMsg} AnyMsg
 */

export const MsgType = /** @type {const} */ ({
  JOIN: 'join',
  READY: 'ready',
  START: 'start',
  WELCOME: 'welcome',
  LOBBY: 'lobby',
  INPUT: 'input',
  MATCH_START: 'match_start',
  ERROR: 'error',
});

/** @param {unknown} value */
export function safeJsonParse(value) {
  if (typeof value !== 'string') return { ok: false, error: 'not a string' };
  try {
    return { ok: true, data: JSON.parse(value) };
  } catch (e) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}

/**
 * @param {AnyMsg} msg
 */
export function encode(msg) {
  return JSON.stringify(msg);
}

/**
 * Minimal runtime validation: ensures msg has a "type" and expected fields.
 * Returns {ok,data} on success, {ok:false,error} on failure.
 *
 * @param {unknown} raw
 */
export function decode(raw) {
  const parsed = safeJsonParse(raw);
  if (!parsed.ok) return parsed;

  const msg = parsed.data;
  if (!msg || typeof msg !== 'object') return { ok: false, error: 'not an object' };
  if (typeof msg.type !== 'string') return { ok: false, error: 'missing type' };

  switch (msg.type) {
    case MsgType.JOIN:
      if (typeof msg.name !== 'string' || msg.name.trim().length === 0) {
        return { ok: false, error: 'join.name required' };
      }
      return { ok: true, data: msg };

    case MsgType.READY:
      if (typeof msg.ready !== 'boolean') {
        return { ok: false, error: 'ready.ready required' };
      }
      return { ok: true, data: msg };

    case MsgType.START:
      return { ok: true, data: msg };

    case MsgType.INPUT:
      if (typeof msg.seq !== 'number') return { ok: false, error: 'input.seq required' };
      if (!msg.axis || typeof msg.axis.x !== 'number' || typeof msg.axis.z !== 'number') {
        return { ok: false, error: 'input.axis required' };
      }
      if (!msg.buttons || typeof msg.buttons !== 'object') {
        return { ok: false, error: 'input.buttons required' };
      }
      return { ok: true, data: msg };

    default:
      // For now we only strictly validate client->server messages.
      return { ok: true, data: msg };
  }
}
