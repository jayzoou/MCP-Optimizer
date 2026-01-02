import { startMcpServer } from './mcpServer';

(async () => {
	try {
		await startMcpServer();
	} catch (err) {
		console.error('Failed to start services:', err);
		process.exit(1);
	}
})();
