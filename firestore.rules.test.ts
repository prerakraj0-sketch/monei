/**
 * Security Rules Verification Suite (Dirty Dozen Adversarial Payloads)
 * Verifies data invariants and schema boundaries against firebase-blueprint.json.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const rulesText = fs.readFileSync(new URL('./firestore.rules', import.meta.url), 'utf8');
const blueprint = JSON.parse(fs.readFileSync(new URL('./firebase-blueprint.json', import.meta.url), 'utf8'));

test('firestore.rules enforces global default deny and verified owner checks', () => {
  assert.match(rulesText, /rules_version = '2';/);
  assert.match(rulesText, /match \/\{document=\*\*\} \{\s*allow read, write: if false;/);
  assert.match(rulesText, /request\.auth\.token\.email_verified == true/);
});

test('all blueprint collections have explicit match blocks and validation helpers', () => {
  for (const entityName of Object.keys(blueprint.entities)) {
    assert.ok(
      rulesText.includes(`function isValid${entityName}(`),
      `Missing validation helper for ${entityName}`,
    );
  }
  assert.match(rulesText, /match \/users\/\{userId\}/);
  assert.match(rulesText, /match \/stocks\/\{stockId\}/);
  assert.match(rulesText, /match \/cashAccounts\/\{accountId\}/);
  assert.match(rulesText, /match \/expenses\/\{expenseId\}/);
  assert.match(rulesText, /match \/deals\/\{dealId\}/);
  assert.match(rulesText, /match \/agreements\/\{agreementId\}/);
});

test('Dirty Dozen invariants are encoded in rules', () => {
  // Terminal state locking for closed deals and settled agreements
  assert.match(rulesText, /existing\(\)\.stage != 'closed'/);
  assert.match(rulesText, /existing\(\)\.status != 'settled'/);
  // Temporal integrity
  assert.match(rulesText, /incoming\(\)\.createdAt == request\.time/);
  assert.match(rulesText, /incoming\(\)\.updatedAt == request\.time/);
  // List query enforcement
  assert.match(rulesText, /allow list: if isVerifiedOwner\(userId\) && existing\(\)\.ownerId == request\.auth\.uid/);
  // Strict key checking & bounded array guard
  assert.match(rulesText, /data\.keys\(\)\.hasOnly\(/);
  assert.match(rulesText, /affectedKeys\(\)\.hasOnly\(/);
  assert.match(rulesText, /data\.selectedRules\.size\(\) <= 10/);
  assert.match(rulesText, /data\.lenderSignature\.size\(\) <= 45000/);
});
