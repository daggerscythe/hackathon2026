import { describe, expect, it } from 'vitest';
import { decode, encode, MsgType } from '../src/messages.js';

describe('shared messages', () => {
  it('encodes and decodes join', () => {
    const raw = encode({ type: MsgType.JOIN, name: 'Alice' });
    const res = decode(raw);
    expect(res.ok).toBe(true);
    expect(res.data.type).toBe(MsgType.JOIN);
  });

  it('rejects join with empty name', () => {
    const res = decode(JSON.stringify({ type: MsgType.JOIN, name: '' }));
    expect(res.ok).toBe(false);
  });

  it('validates input has axis/seq', () => {
    const res = decode(JSON.stringify({ type: MsgType.INPUT, seq: 1, buttons: {}, axis: { x: 0, z: 1 } }));
    expect(res.ok).toBe(true);
  });

  it('validates ready requires boolean', () => {
    expect(decode(JSON.stringify({ type: MsgType.READY, ready: true })).ok).toBe(true);
    expect(decode(JSON.stringify({ type: MsgType.READY, ready: 'yes' })).ok).toBe(false);
  });

  it('validates pick requires classId', () => {
    expect(decode(JSON.stringify({ type: MsgType.PICK, classId: 'hero:tank' })).ok).toBe(true);
    expect(decode(JSON.stringify({ type: MsgType.PICK, classId: '' })).ok).toBe(false);
  });
});
