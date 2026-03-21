import { createGameServer } from './server.js';

const port = Number(process.env.PORT ?? 8080);
createGameServer({ port });

// eslint-disable-next-line no-console
console.log(`game-server listening on ws://localhost:${port}`);
