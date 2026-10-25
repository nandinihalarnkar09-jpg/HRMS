// npm run offline → start Lehar HR on http://localhost:3000 with the embedded database and the
// offline email + password sign-in (password: firstname@KCF2026). No internet, Supabase or Clerk needed. (The AI assistant needs internet.)
import { spawn } from 'node:child_process';

const env = { ...process.env, DB_MODE: 'pglite', AUTH_MODE: 'dev', NEXT_TELEMETRY_DISABLED: '1', NEXT_PUBLIC_APP_URL: 'http://localhost:3000' };
const child = spawn('npx', ['next', 'dev', '--port', '3000'], { stdio: 'inherit', shell: true, env });
child.on('exit', (code) => process.exit(code ?? 0));
