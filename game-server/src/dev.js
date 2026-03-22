import { createGameServer } from './server.js';

const port = Number(process.env.PORT ?? 8080);
const server = createGameServer({ port });

server.wss.on('error', (err) => {
	if (err && typeof err === 'object' && 'code' in err && err.code === 'EADDRINUSE') {
		// eslint-disable-next-line no-console
		console.error(`Port ${port} is already in use. Close the other server or run with a different PORT (PowerShell: $env:PORT=8081; pnpm dev:server).`);
	} else {
		// eslint-disable-next-line no-console
		console.error('game-server error', err);
	}
	process.exitCode = 1;
});

// eslint-disable-next-line no-console
console.log(`game-server listening on ws://localhost:${port}`);
