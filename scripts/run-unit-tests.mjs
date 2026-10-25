// Runs the unit tests twice, under UTC-8 and UTC+14, to prove nothing depends on the host time zone
// (NFR "Test by changing your laptop's time zone"). Works the same on Windows, macOS and Linux.
import { spawnSync } from 'node:child_process';

const zones = ['America/Los_Angeles', 'Pacific/Kiritimati'];
let failed = false;
for (const tz of zones) {
  console.log(`\n▶ unit tests with TZ=${tz}`);
  const r = spawnSync('npx', ['tsx', '--test', 'tests/unit/*.test.ts'], { stdio: 'inherit', shell: true, env: { ...process.env, TZ: tz } });
  if (r.status !== 0) failed = true;
}
process.exit(failed ? 1 : 0);
