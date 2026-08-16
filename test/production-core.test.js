'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildProductionTrackingUrl,
  normalizeProductionInput,
  validateProductionTrackingUrl,
  extractProductionSnapshot
} = require('../src/production-core');

test('builds an official accepted-article tracking URL from author information', () => {
  const result = buildProductionTrackingUrl({
    reference: 'SEPS_102545',
    lastName: 'Monturano',
    firstName: 'Gianluca'
  });
  assert.equal(result.journalId, 'SEPS');
  assert.equal(result.articleId, '102545');
  assert.match(result.url, /^https:\/\/authors\.elsevier\.com\/tracking\/article\/details\.do\?/);
  assert.equal(validateProductionTrackingUrl(result.url), result.url);
  assert.equal(
    buildProductionTrackingUrl({ reference: 'SEPS102545', lastName: 'Monturano' }).articleId,
    '102545'
  );
});

test('rejects an Editorial Manager review number in author-information mode', () => {
  assert.throws(
    () => normalizeProductionInput({ reference: 'ENVPOL-D-26-02738', lastName: 'Zhao' }),
    /Editorial Manager 审稿编号/
  );
});

test('extracts accepted-article metadata and production events', () => {
  const html = `
    <span id="articleTitle">A safer water treatment process</span>
    <dd id="articleReference">SEPS_102545</dd>
    <dd id="journalTitle">Socio-Economic Planning Sciences</dd>
    <dd id="correspondingAuthorName">Gianluca&nbsp;Monturano</dd>
    <dd id="firstAuthorNameId">Angela Bergantino</dd>
    <dd id="editorialReceivedDate">28 Apr 2026</dd>
    <dd id="acceptedDate">19 Jun 2026</dd>
    <dd id="doi"><a>10.1016/j.example.2026.1</a></dd>
    <span id="lastUpdatedDate">15 Jul 2026</span>
    <table><tbody>
      <tr><td id="proofsAvailableEventDate">6 Jul 2026</td><td id="proofsAvailableEvent">Proofs available for checking</td></tr>
      <tr><td id="receivedEventDate">20 Jun 2026</td><td id="receivedEvent">Received for production</td></tr>
    </tbody></table>`;
  const snapshot = extractProductionSnapshot(html);
  assert.equal(snapshot.kind, 'production');
  assert.equal(snapshot.articleReference, 'SEPS_102545');
  assert.equal(snapshot.status.label, '校样已到，请及时检查');
  assert.equal(snapshot.productionEvents.length, 2);
  assert.equal(snapshot.correspondingAuthor, 'Gianluca Monturano');
});

test('rejects an Elsevier production page without a matching article', () => {
  assert.throws(() => extractProductionSnapshot('<html>not found</html>'), /未找到匹配的已接收文章/);
});

test('rejects a production page whose critical structure has changed', () => {
  assert.throws(
    () => extractProductionSnapshot('<span id="articleTitle">A title</span><dd id="journalTitle">A journal</dd>'),
    /页面结构可能已变化/
  );
});
