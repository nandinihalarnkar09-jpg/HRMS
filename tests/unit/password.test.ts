import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultPassword, hashPassword, verifyPassword, signSession, verifySession } from '../../lib/auth/password';

test('Local passwords are scrypt-hashed and verified in constant time (D-17)', () => {
  const h = hashPassword('priya@KCF2026');
  assert.match(h, /^scrypt\$/);
  assert.ok(!h.includes('priya'), 'plain password never stored');
  assert.equal(verifyPassword('priya@KCF2026', h), true);
  assert.equal(verifyPassword('Priya@KCF2026', h), false);
  assert.notEqual(hashPassword('x'), hashPassword('x'), 'random salt');
});

test('Default password is <firstname>@KCF2026', () => {
  assert.equal(defaultPassword('Priya Naik'), 'priya@KCF2026');
  assert.equal(defaultPassword("Joel D'Souza"), 'joel@KCF2026');
});

test('Session cookie is signed and expires; tampering is rejected', () => {
  const now = 1_800_000_000_000;
  const t = signSession('ravi.gaonkar+clerk_test@example.com', 'secret', 12, now);
  assert.equal(verifySession(t, 'secret', now + 1000), 'ravi.gaonkar+clerk_test@example.com');
  assert.equal(verifySession(t, 'other-secret', now), null, 'wrong key');
  assert.equal(verifySession(t, 'secret', now + 13 * 3_600_000), null, 'expired');
  const forged = Buffer.from('priya.naik+clerk_test@example.com').toString('base64url') + t.slice(t.indexOf('.'));
  assert.equal(verifySession(forged, 'secret', now), null, 'cannot swap the email');
  assert.equal(verifySession('ravi@example.com', 'secret', now), null, 'old unsigned cookie rejected');
});
