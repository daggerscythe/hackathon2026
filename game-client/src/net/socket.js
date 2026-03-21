import { decode, encode, MsgType } from '@hack/shared';

/**
 * @param {{ url: string, name: string, onMessage: (msg:any)=>void, onStatus:(s:string)=>void }} opts
 */
export function connectToServer({ url, name, onMessage, onStatus }) {
  const ws = new WebSocket(url);

  ws.addEventListener('open', () => {
    onStatus('connected');
    ws.send(encode({ type: MsgType.JOIN, name }));
  });

  ws.addEventListener('close', () => onStatus('disconnected'));
  ws.addEventListener('error', () => onStatus('error'));

  ws.addEventListener('message', (evt) => {
    const res = decode(evt.data);
    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.warn('bad message', res.error);
      return;
    }
    onMessage(res.data);
  });

  return {
    ws,
    send: (msg) => ws.send(encode(msg)),
    close: () => ws.close(),
  };
}
