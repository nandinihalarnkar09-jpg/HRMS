import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validatePan, validateAadhaar, validateUan, validateIfsc, validateMobile, validatePincode,
  validateAgeOnJoining, validateEmployee, normalise,
} from '../../lib/core/validation';
import { maskPan, maskAadhaar, maskAccount, maskUan, maskForAudit } from '../../lib/core/masking';

test('Checklist: invalid PAN (ABC123) is rejected with a clear message — R-EMP-01', () => {
  assert.match(validatePan('ABC123')!, /5 letters, 4 digits, 1 letter/);
  assert.equal(validatePan('abcde1234f'), null, 'lower case is normalised');
  assert.notEqual(validatePan('ABCDE12345'), null);
  assert.notEqual(validatePan('1BCDE1234F'), null);
});

test('Aadhaar must be 12 digits; spaces allowed on input — R-EMP-02', () => {
  assert.equal(validateAadhaar('2345 6789 0123'), null);
  assert.match(validateAadhaar('12345678901')!, /12 digits/);
  assert.notEqual(validateAadhaar('123456789012'), null, 'D2: cannot start with 1');
  assert.notEqual(validateAadhaar('12345678901a'), null);
});

test('UAN optional, else 12 digits — R-EMP-03', () => {
  assert.equal(validateUan(''), null);
  assert.equal(validateUan(null), null);
  assert.equal(validateUan('100912345678'), null);
  assert.notEqual(validateUan('10091234567'), null);
});

test('Checklist: invalid IFSC is rejected — R-EMP-04', () => {
  assert.equal(validateIfsc('SBIN0001234'), null);
  assert.equal(validateIfsc('hdfc0ABC123'), null, 'normalised to upper case');
  assert.match(validateIfsc('SBIN1001234')!, /then 0/);
  assert.notEqual(validateIfsc('SBI00012345'), null);
  assert.notEqual(validateIfsc('SBIN000123'), null);
});

test('Checklist: 9-digit mobile is rejected — R-EMP-05', () => {
  assert.match(validateMobile('987654321')!, /10 digits starting with 6, 7, 8 or 9/);
  assert.notEqual(validateMobile('5876543210'), null);
  assert.equal(validateMobile('9876543210'), null);
  assert.equal(validateMobile('+91 98765 43210'), null);
  assert.equal(normalise.mobile('+91 98765 43210'), '9876543210');
});

test('PIN code is 6 digits, not starting with 0 — R-EMP-06', () => {
  assert.equal(validatePincode('403001'), null);
  assert.notEqual(validatePincode('03001'), null);
  assert.notEqual(validatePincode('013001'), null);
});

test('Checklist: employee aged 17 on joining date is rejected — R-EMP-07', () => {
  assert.match(validateAgeOnJoining('2009-01-01', '2026-10-25')!, /at least 18/); // 17
  assert.equal(validateAgeOnJoining('2008-10-25', '2026-10-25'), null);         // exactly 18 that day
  assert.notEqual(validateAgeOnJoining('2008-10-26', '2026-10-25'), null);      // 18 tomorrow
});

test('validateEmployee collects every field error at once', () => {
  const r = validateEmployee({
    full_name: 'R', email: 'nope', mobile: '123', dob: '2010-01-01', gender: 'Female',
    address_line1: 'Plot 4', city: 'Panaji', state: 'Goa', pincode: '403001', date_of_joining: '2026-10-01',
    designation: 'Clerk', department_id: 1, location_id: 1, salary_grade: 'G1',
    pan: 'ABC123', aadhaar: '1', uan: '', account_number: '12', ifsc: 'X', bank_name: 'SBI', account_holder_name: 'R',
    emergency_contact_name: 'M', emergency_contact_relation: 'Mother', emergency_contact_phone: '9876543210',
  });
  assert.equal(r.ok, false);
  if (!r.ok) {
    for (const f of ['full_name', 'email', 'mobile', 'dob', 'pan', 'aadhaar', 'account_number', 'ifsc'] as const) {
      assert.ok(r.errors[f], `expected error on ${f}`);
    }
  }
});

test('Masking formats — R-EMP-10 (E7)', () => {
  assert.equal(maskPan('ABCDE1234F'), 'ABCDE****F');
  assert.equal(maskAadhaar('1234'), 'XXXX XXXX 1234');
  assert.equal(maskAadhaar('123456789012'), 'XXXX XXXX 9012', 'a full number is still masked');
  assert.equal(maskAccount('1234'), 'XXXXXX1234');
  assert.equal(maskAccount('00112233445566'), 'XXXXXX5566');
  assert.equal(maskUan('100912345678'), '1009****5678');
  assert.equal(maskPan(null), '—');
});

test('Audit log stores statutory values masked — R-EMP-12', () => {
  assert.equal(maskForAudit('aadhaar', '123456789012'), 'XXXX XXXX 9012');
  assert.equal(maskForAudit('pan', 'ABCDE1234F'), 'ABCDE****F');
  assert.equal(maskForAudit('designation', 'Supervisor'), 'Supervisor');
});
