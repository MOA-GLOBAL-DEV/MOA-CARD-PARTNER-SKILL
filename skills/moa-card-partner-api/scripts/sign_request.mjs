#!/usr/bin/env node
// MOA 카드 파트너 API 요청 서명 도구 (Node.js 20 이상, 외부 패키지 없음)
//
// 서명 원문(5줄, LF로 잇고 마지막 줄 뒤에는 줄바꿈 없음)
//   timestamp \n METHOD \n path_with_query \n idempotency_key(없으면 빈 줄) \n hex(sha256(본문 바이트))
// X-Moa-Signature = "v1=" + hex(HMAC-SHA256(key = 비밀키 문자열의 UTF-8 바이트, message = 원문))
//
// 사용법
//   export MOA_PARTNER_KEY_ID=pk_test_...   # 키 ID
//   export MOA_PARTNER_SECRET=sk_test_...   # 비밀키. 이 스크립트는 비밀키를 출력하지 않는다
//   node sign_request.mjs --method GET --path /partner/v1/ping
//   node sign_request.mjs --method POST --path /partner/v1/members \
//        --body '{"email":"user@example.com","partner_member_id":"u-1029"}'
//   node sign_request.mjs ... --curl        # 그대로 실행할 수 있는 curl 명령 출력(서명은 한 번만 쓸 수 있다)
//   node sign_request.mjs --self-test       # 문서의 검증용 고정값으로 서명 함수 확인(환경변수 불필요)
//
// 모듈로 쓰기
//   import { signRequest, buildSignedHeaders } from './sign_request.mjs';

import { createHash, createHmac, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

export const DEFAULT_BASE_URL = 'https://api.moacard.io';
export const EMPTY_BODY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

/** data: string(UTF-8로 해시) 또는 Buffer/Uint8Array(바이트 그대로) */
export function sha256Hex(data) {
  return createHash('sha256').update(data ?? '').digest('hex');
}

/** 서명 원문 5줄 */
export function canonicalString(timestamp, method, pathWithQuery, idempotencyKey, rawBody) {
  return [String(timestamp), method.toUpperCase(), pathWithQuery, idempotencyKey || '', sha256Hex(rawBody ?? '')].join('\n');
}

/** X-Moa-Signature 값(v1=<소문자 hex 64자>) */
export function signRequest(secret, timestamp, method, pathWithQuery, idempotencyKey, rawBody) {
  const canonical = canonicalString(timestamp, method, pathWithQuery, idempotencyKey, rawBody);
  return 'v1=' + createHmac('sha256', secret).update(canonical, 'utf8').digest('hex');
}

/** "https://api.moacard.io/partner/v1/x?y" → "/partner/v1/x?y" (쿼리 문자열은 손대지 않는다) */
export function toPathWithQuery(pathOrUrl) {
  return String(pathOrUrl).replace(/^https?:\/\/[^/]+/i, '');
}

/**
 * 서명 헤더를 만든다.
 * - POST인데 idempotencyKey가 없으면 새 UUID를 만든다(재시도할 때는 처음 키를 다시 넘긴다)
 * - timestamp는 매번 현재 시각(초). 같은 서명은 서버가 한 번만 받는다
 * - body는 실제로 보낼 바이트(문자열 또는 Buffer). 서명한 뒤 다시 직렬화하지 않는다
 */
export function buildSignedHeaders({ keyId, secret, method, pathWithQuery, body = '', idempotencyKey, timestamp }) {
  if (!keyId || !secret) throw new Error('keyId와 secret이 필요합니다');
  const m = method.toUpperCase();
  const path = toPathWithQuery(pathWithQuery);
  const ts = String(timestamp ?? Math.floor(Date.now() / 1000));
  const key = idempotencyKey || (m === 'POST' ? randomUUID() : '');
  const headers = {
    'X-Moa-Key-Id': keyId,
    'X-Moa-Timestamp': ts,
    'X-Moa-Signature': signRequest(secret, ts, m, path, key, body),
  };
  if (key) headers['Idempotency-Key'] = key;
  if (body && body.length > 0) headers['Content-Type'] = 'application/json';
  return { headers, canonical: canonicalString(ts, m, path, key, body), idempotencyKey: key || null };
}

// ─── 검증용 고정값(문서 전용 가짜 비밀키) ────────────────────────────────────

export const TEST_VECTORS = [
  {
    name: 'POST /partner/v1/members',
    secret: 'sk_test_TestSecretForDocumentationOnly0000000000000',
    timestamp: '1793928225',
    method: 'POST',
    pathWithQuery: '/partner/v1/members',
    idempotencyKey: '7f3c2a10-5b8e-4c1d-9a6f-2e4b8d0c1a35',
    body: '{"email":"user@example.com","partner_member_id":"u-1029"}',
    bodySha256: '0c14b4384d77f3e98410d6043f1af826ad251bb6be678fa9fad42d8ff50fc798',
    signature: 'v1=25a4a6baf576fb3ded36b501a6139b36941a191eabc6895fa244d58230042823',
  },
  {
    name: 'GET /partner/v1/members?partner_member_id=u-1029',
    secret: 'sk_test_TestSecretForDocumentationOnly0000000000000',
    timestamp: '1793928225',
    method: 'GET',
    pathWithQuery: '/partner/v1/members?partner_member_id=u-1029',
    idempotencyKey: '',
    body: '',
    bodySha256: EMPTY_BODY_SHA256,
    signature: 'v1=3fd357c7aed5d76a43613ef7df241e32ac65736e0d19743faea604ac8e3dc9b8',
  },
];

export function selfTest(log = console.log) {
  let ok = true;
  for (const v of TEST_VECTORS) {
    const bodySha = sha256Hex(v.body);
    const sig = signRequest(v.secret, v.timestamp, v.method, v.pathWithQuery, v.idempotencyKey, v.body);
    const pass = bodySha === v.bodySha256 && sig === v.signature;
    ok &&= pass;
    log(`${pass ? 'PASS' : 'FAIL'}  ${v.name}`);
    log(`      body_sha256 ${bodySha}`);
    log(`      signature   ${sig}${pass ? '' : `  (기대값 ${v.signature})`}`);
  }
  return ok;
}

// ─── CLI ─────────────────────────────────────────────────────────────────

const shellQuote = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

function main() {
  const { values } = parseArgs({
    options: {
      method: { type: 'string', default: 'GET' },
      path: { type: 'string' },
      body: { type: 'string' },
      'body-file': { type: 'string' },
      'idempotency-key': { type: 'string' },
      timestamp: { type: 'string' },
      'base-url': { type: 'string' },
      curl: { type: 'boolean', default: false },
      'self-test': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  if (values.help) {
    console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).slice(0, 18).join('\n'));
    return 0;
  }
  if (values['self-test']) return selfTest() ? 0 : 1;

  const keyId = process.env.MOA_PARTNER_KEY_ID;
  const secret = process.env.MOA_PARTNER_SECRET;
  if (!keyId || !secret) {
    console.error('환경변수 MOA_PARTNER_KEY_ID, MOA_PARTNER_SECRET을 설정하세요(값은 출력하지 않습니다).');
    return 2;
  }
  if (!values.path) {
    console.error('--path가 필요합니다. 예: --path /partner/v1/ping');
    return 2;
  }
  const keyEnv = /^pk_(test|live)_/.exec(keyId)?.[1];
  const secretEnv = /^sk_(test|live)_/.exec(secret)?.[1];
  if (!keyEnv) console.error('경고: 키 ID가 pk_test_ 또는 pk_live_로 시작하지 않습니다.');
  if (!secretEnv) console.error('경고: 비밀키가 sk_test_ 또는 sk_live_로 시작하지 않습니다(값은 출력하지 않습니다).');
  if (keyEnv && secretEnv && keyEnv !== secretEnv) console.error(`경고: 키 ID(${keyEnv})와 비밀키(${secretEnv})의 환경이 다릅니다.`);

  const pathWithQuery = toPathWithQuery(values.path);
  if (!pathWithQuery.startsWith('/partner/v1/')) {
    console.error('경고: 서명 경로는 /partner/v1부터 써야 합니다(예: /partner/v1/members). 문서의 짧은 표기를 그대로 서명하면 401입니다.');
  }
  if (values.body !== undefined && values['body-file'] !== undefined) {
    console.error('--body와 --body-file 중 하나만 쓰세요.');
    return 2;
  }
  const body = values['body-file'] !== undefined ? readFileSync(values['body-file']) : (values.body ?? '');
  const method = values.method.toUpperCase();
  if (method === 'GET' && body.length > 0) console.error('경고: GET 요청에는 본문을 보내지 않습니다.');

  const { headers, canonical, idempotencyKey } = buildSignedHeaders({
    keyId,
    secret,
    method,
    pathWithQuery,
    body,
    idempotencyKey: values['idempotency-key'],
    timestamp: values.timestamp,
  });
  const baseUrl = (values['base-url'] ?? process.env.MOA_PARTNER_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  const url = baseUrl + pathWithQuery;

  if (values.curl) {
    const parts = ['curl', '-sS', '-i', '-X', method, shellQuote(url)];
    for (const [k, v] of Object.entries(headers)) parts.push('-H', shellQuote(`${k}: ${v}`));
    if (body.length > 0) {
      if (values['body-file'] !== undefined) parts.push('--data-binary', shellQuote(`@${values['body-file']}`));
      else parts.push('--data-raw', shellQuote(body));
    }
    console.log(parts.join(' '));
    console.error('참고: 이 서명은 한 번만 쓸 수 있고 ±300초 안에서만 유효합니다. 다시 보낼 때는 새로 만드세요.');
    return 0;
  }
  console.log(
    JSON.stringify({ method, url, headers, idempotency_key: idempotencyKey, body_sha256: sha256Hex(body), canonical }, null, 2),
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
