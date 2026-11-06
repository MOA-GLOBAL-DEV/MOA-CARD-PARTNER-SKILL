#!/usr/bin/env node
// MOA 카드 파트너 API 웹훅 서명 검증 (Node.js 20 이상, 외부 패키지 없음)
//
// X-Moa-Signature: t=<Unix 초>,v1=<hex>
// v1 = hex(HMAC-SHA256(key = 웹훅 서명 키(whsec_…) 문자열의 UTF-8 바이트, message = t + "." + 받은 본문 원문 바이트))
// - 본문은 받은 그대로의 바이트로 검증한다(JSON 파싱 후 다시 직렬화하면 맞지 않는다)
// - t가 현재 시각과 300초 넘게 차이 나면 버린다. 비교는 상수 시간
//
// 사용법
//   export MOA_WEBHOOK_SECRET=whsec_...     # 이 스크립트는 키를 출력하지 않는다
//   node verify_webhook.mjs --header 't=1793928225,v1=…' --body-file body.json [--now 1793928225]
//   node verify_webhook.mjs --self-test     # 문서의 검증용 고정값 확인(환경변수 불필요)
//
// 모듈로 쓰기
//   import { verifyMoaWebhook } from './verify_webhook.mjs';
//   verifyMoaWebhook(secret, req.get('X-Moa-Signature'), rawBodyBuffer) // true / false

import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

export const DEFAULT_TOLERANCE_SEC = 300;

/** "t=…,v1=…" → { t, v1 } (없으면 빈 문자열) */
export function parseSignatureHeader(header) {
  const parts = {};
  for (const item of String(header ?? '').split(',')) {
    const i = item.indexOf('=');
    if (i > 0) parts[item.slice(0, i).trim()] = item.slice(i + 1).trim();
  }
  return { t: parts.t ?? '', v1: parts.v1 ?? '' };
}

/**
 * 검증 결과와 실패 사유. rawBody는 받은 그대로의 Buffer/Uint8Array 또는 문자열
 * reason: malformed_header | timestamp_out_of_range | signature_mismatch
 */
export function checkMoaWebhook(secret, signatureHeader, rawBody, { toleranceSec = DEFAULT_TOLERANCE_SEC, nowSec = Math.floor(Date.now() / 1000) } = {}) {
  const { t, v1 } = parseSignatureHeader(signatureHeader);
  if (!/^\d+$/.test(t) || !/^[0-9a-fA-F]{64}$/.test(v1)) return { ok: false, reason: 'malformed_header' };
  if (Math.abs(nowSec - Number(t)) > toleranceSec) return { ok: false, reason: 'timestamp_out_of_range' };
  const expected = createHmac('sha256', secret).update(`${t}.`).update(rawBody ?? '').digest();
  const ok = timingSafeEqual(expected, Buffer.from(v1, 'hex'));
  return ok ? { ok: true } : { ok: false, reason: 'signature_mismatch' };
}

/** true / false */
export function verifyMoaWebhook(secret, signatureHeader, rawBody, opts) {
  return checkMoaWebhook(secret, signatureHeader, rawBody, opts).ok;
}

// ─── 검증용 고정값(문서 전용 가짜 키) ──────────────────────────────────────

export const TEST_VECTOR = {
  secret: 'whsec_TestWebhookSecretForDocumentationOnly000000',
  body: '{"event_id":"evt_01jbz7h3k5n7q9s1v3x5z7b9d1","type":"ping","environment":"test","created_at":"2026-11-06T01:23:45.000Z","data":{"partner_id":"ptn_01jbz0a1b2c3d4e5f6g7h8j9k0"}}',
  header: 't=1793928225,v1=049e6da144aa7c27f1f770f389cba4c8989bd05d5c812329b421f8fecde69694',
  nowSec: 1793928225,
};

export function selfTest(log = console.log) {
  const v = TEST_VECTOR;
  const cases = [
    ['고정값 그대로 → valid', checkMoaWebhook(v.secret, v.header, Buffer.from(v.body, 'utf8'), { nowSec: v.nowSec }), true],
    ['본문 한 글자 변경 → invalid', checkMoaWebhook(v.secret, v.header, v.body.replace('ping', 'pong'), { nowSec: v.nowSec }), false],
    ['다른 키 → invalid', checkMoaWebhook('whsec_Other', v.header, v.body, { nowSec: v.nowSec }), false],
    ['t가 301초 지남 → invalid', checkMoaWebhook(v.secret, v.header, v.body, { nowSec: v.nowSec + 301 }), false],
    ['t가 300초 지남 → valid', checkMoaWebhook(v.secret, v.header, v.body, { nowSec: v.nowSec + 300 }), true],
    ['헤더 형식 오류 → invalid', checkMoaWebhook(v.secret, 'v1=abc', v.body, { nowSec: v.nowSec }), false],
  ];
  let ok = true;
  for (const [name, result, expected] of cases) {
    const pass = result.ok === expected;
    ok &&= pass;
    log(`${pass ? 'PASS' : 'FAIL'}  ${name}${result.reason ? ` (${result.reason})` : ''}`);
  }
  return ok;
}

// ─── CLI ─────────────────────────────────────────────────────────────────

function main() {
  const { values } = parseArgs({
    options: {
      header: { type: 'string' },
      body: { type: 'string' },
      'body-file': { type: 'string' },
      now: { type: 'string' },
      tolerance: { type: 'string' },
      'self-test': { type: 'boolean', default: false },
    },
  });
  if (values['self-test']) return selfTest() ? 0 : 1;
  const secret = process.env.MOA_WEBHOOK_SECRET;
  if (!secret) {
    console.error('환경변수 MOA_WEBHOOK_SECRET을 설정하세요(값은 출력하지 않습니다).');
    return 2;
  }
  if (!values.header || (values.body === undefined && values['body-file'] === undefined)) {
    console.error("--header 't=…,v1=…'와 --body-file(또는 --body)이 필요합니다.");
    return 2;
  }
  const raw = values['body-file'] !== undefined ? readFileSync(values['body-file']) : Buffer.from(values.body, 'utf8');
  const result = checkMoaWebhook(secret, values.header, raw, {
    nowSec: values.now !== undefined ? Number(values.now) : undefined,
    toleranceSec: values.tolerance !== undefined ? Number(values.tolerance) : undefined,
  });
  console.log(result.ok ? 'valid' : `invalid (${result.reason})`);
  return result.ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
