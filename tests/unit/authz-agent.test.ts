import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canApprove, canViewProfile, canRevealSensitive, canSeeTeamMember, canApproveRegularisation, type Actor } from '../../lib/core/authz';
import { redactPii, containsSensitiveId } from '../../lib/core/redact';
import { searchPolicy } from '../../lib/core/policy-search';

const actor = (id: string, over: Partial<Actor> = {}): Actor => ({
  id, employeeCode: 'KCF0000', fullName: id, email: `${id}@x.in`, isHrAdmin: false, isManager: false,
  locationId: 1, directReportIds: [], ...over,
});
const mgr = actor('mgr', { isManager: true, directReportIds: ['emp'] });
const hr = actor('hr', { isHrAdmin: true });
const emp = { id: 'emp', reportingManagerId: 'mgr' };
const other = { id: 'other', reportingManagerId: 'someone' };

test('Checklist: a manager cannot approve their own leave — R-LV-11', () => {
  assert.equal(canApprove(mgr, { id: 'mgr', reportingManagerId: 'boss' }), false);
  assert.equal(canApprove(hr, { id: 'hr', reportingManagerId: 'boss' }), false, 'not even HR');
  assert.equal(canApprove(mgr, emp), true);
  assert.equal(canApprove(mgr, other), false, 'only direct reports');
  assert.equal(canApprove(hr, other), true);
});

test('Checklist: an employee cannot open another employee profile — E3/§4.2', () => {
  assert.equal(canViewProfile(actor('emp'), other), false);
  assert.equal(canViewProfile(actor('emp'), emp), true);
  assert.equal(canViewProfile(mgr, emp), false, 'managers use team views, not full profiles');
  assert.equal(canViewProfile(hr, other), true);
});

test('Aadhaar can never be revealed, even by HR — D-3', () => {
  assert.equal(canRevealSensitive(hr, 'aadhaar'), false);
  assert.equal(canRevealSensitive(hr, 'pan'), true);
  assert.equal(canRevealSensitive(mgr, 'pan'), false);
});

test('Team scope: managers see direct reports only', () => {
  assert.equal(canSeeTeamMember(mgr, emp), true);
  assert.equal(canSeeTeamMember(mgr, other), false);
  assert.equal(canSeeTeamMember(actor('emp'), emp), false);
});

test('Regularisation raised by a manager goes to HR — D-6', () => {
  assert.equal(canApproveRegularisation(mgr, emp, 'emp'), true);
  assert.equal(canApproveRegularisation(mgr, emp, 'mgr'), false);
  assert.equal(canApproveRegularisation(hr, emp, 'mgr'), true);
  assert.equal(canApproveRegularisation(actor('emp'), emp, 'emp'), false);
});

test('PII never reaches the model: redactPii', () => {
  assert.equal(redactPii('my aadhaar is 1234 5678 9012 ok'), 'my aadhaar is [redacted] ok');
  assert.equal(redactPii('PAN ABCDE1234F'), 'PAN [redacted]');
  assert.equal(redactPii('acct 00112233445566 ifsc SBIN0001234'), 'acct [redacted] ifsc [redacted]');
  assert.equal(redactPii('kal ki chutti chahiye, 2 din'), 'kal ki chutti chahiye, 2 din');
  assert.equal(containsSensitiveId('balance 6.5 days'), false);
});

const POLICY = [{
  slug: 'leave', title: 'Leave policy', body: [
    '## Casual Leave',
    '- Casual Leave (CL): 8 days a year, credited on 1 January, pro-rated for joiners. Lapses on 31 December. Half day allowed.',
    '## Sick Leave',
    '- Sick Leave (SL) of more than 2 days needs a medical certificate.',
    '## Sandwich rule',
    '- Weekly offs and holidays inside a leave period are never counted. Konkan has no sandwich rule.',
    '## Late',
    '- Check-in after 10:15 AM is Late. Three Late marks in a month = half day loss of pay.',
  ].join('\n'),
}];

test('Policy answers come only from stored text; unknown topics → not found', () => {
  const r = searchPolicy(POLICY, 'Do I need a medical certificate for sick leave?');
  assert.equal(r.found, true);
  assert.match(r.sections[0].text, /medical certificate/);
  assert.equal(searchPolicy(POLICY, 'What is the gym reimbursement limit?').found, false);
  assert.equal(searchPolicy(POLICY, 'bimar hone par certificate chahiye?').found, true, 'Hinglish');
  assert.equal(searchPolicy(POLICY, 'der se aaya toh salary katega?').found, true, 'Hinglish late');
});
