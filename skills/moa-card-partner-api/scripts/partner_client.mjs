#!/usr/bin/env node
// MOA 카드 파트너 API 최소 클라이언트 예제 (Node.js 20 이상, 외부 패키지 없음)
// - 요청마다 그때 시각으로 서명한다(서버는 같은 서명을 600초 동안 한 번만 받는다)
// - 모든 POST에 Idempotency-Key를 넣는다. 재시도는 "같은 키 + 새 시각·새 서명"
// - 재시도 대상: 응답 없음(타임아웃·연결 끊김), error.retryable === true(409 request_in_progress, 429, 500, 503),
//   JSON 본문이 없는 429·502·503·504(네트워크 앞단 응답). Retry-After가 있으면 그만큼, 없으면 1·2·4초… 지수 백오프
// - 401·400·403·404·409(업무)·422·502 issuer_error는 재시도하지 않고 결과를 그대로 돌려준다
//
// 사용법
//   export MOA_PARTNER_KEY_ID=pk_test_... MOA_PARTNER_SECRET=sk_test_...
//   node partner_client.mjs GET /ping
//   node partner_client.mjs POST /members '{"email":"user@example.com","partner_member_id":"u-1029"}'
//   node partner_client.mjs POST /members '<같은 본문>' --idempotency-key <처음 키>   # 응답을 못 받은 POST 재전송
//   node partner_client.mjs --self-test     # 로컬 모의 서버로 서명·멱등·재시도 규칙 확인(네트워크·키 불필요)
//
// 모듈로 쓰기
//   import { createPartnerClient } from './partner_client.mjs';
//   const moa = createPartnerClient();                     // 환경변수에서 키를 읽는다
//   const r = await moa.call('POST', '/members', { email, partner_member_id });
//   // r.status, r.body.data 또는 r.body.error, r.requestId(X-Request-Id), r.idempotencyKey, r.replayed

import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { DEFAULT_BASE_URL, sha256Hex, signRequest } from './sign_request.mjs';

const realSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const FRONT_RETRYABLE_STATUS = new Set([429, 502, 503, 504]);

/** "/members" → "/partner/v1/members". query 객체는 URLSearchParams로 한 번만 문자열로 만든다(서명과 요청에 같은 문자열) */
export function buildPathWithQuery(path, query) {
  let p = path.startsWith('/partner/v1') ? path : `/partner/v1${path.startsWith('/') ? '' : '/'}${path}`;
  if (query) {
    const entries = Object.entries(query).filter(([, v]) => v !== undefined && v !== null);
    const qs = new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString();
    if (qs) p += (p.includes('?') ? '&' : '?') + qs;
  }
  return p;
}

export function createPartnerClient({
  keyId = process.env.MOA_PARTNER_KEY_ID,
  secret = process.env.MOA_PARTNER_SECRET,
  baseUrl = process.env.MOA_PARTNER_BASE_URL ?? DEFAULT_BASE_URL,
  maxRetries = 3,
  timeoutMs = 30_000,
  maxRetryAfterSec = 60,
  fetchImpl = globalThis.fetch,
  log = () => {},
} = {}) {
  if (!keyId || !secret) throw new Error('키 ID와 비밀키가 필요합니다(MOA_PARTNER_KEY_ID, MOA_PARTNER_SECRET)');
  const origin = baseUrl.replace(/\/+$/, '');
  // 요청 지문(메서드·경로·멱등키·본문) → 마지막으로 서명에 쓴 시각. 같은 초에 똑같은 서명이 두 번 나가지 않게 한다
  const lastTs = new Map();
  const backoffMs = (attempt) => Math.min(1000 * 2 ** attempt, 30_000);

  async function freshTimestamp(fingerprint) {
    for (;;) {
      const ts = Math.floor(Date.now() / 1000);
      const last = lastTs.get(fingerprint);
      if (last === undefined || ts > last) {
        lastTs.set(fingerprint, ts);
        if (lastTs.size > 1000) for (const [k, v] of lastTs) if (v < ts - 2) lastTs.delete(k);
        return String(ts);
      }
      await realSleep(1000 - (Date.now() % 1000) + 5); // 다음 초까지
    }
  }

  /**
   * 한 번의 "의도"를 보낸다. HTTP 오류는 던지지 않고 결과로 돌려준다.
   * 응답을 끝내 받지 못하면 던진다(err.idempotencyKey로 나중에 같은 키로 다시 보낸다)
   */
  async function call(method, path, body, { idempotencyKey, query } = {}) {
    const m = method.toUpperCase();
    const pathWithQuery = buildPathWithQuery(path, query);
    const raw = body === undefined || body === null ? '' : typeof body === 'string' ? body : JSON.stringify(body);
    const key = m === 'POST' ? idempotencyKey || randomUUID() : '';
    const fingerprint = `${m} ${pathWithQuery} ${key} ${sha256Hex(raw)}`;

    for (let attempt = 0; ; attempt++) {
      const ts = await freshTimestamp(fingerprint);
      const headers = {
        'X-Moa-Key-Id': keyId,
        'X-Moa-Timestamp': ts,
        'X-Moa-Signature': signRequest(secret, ts, m, pathWithQuery, key, raw),
      };
      if (key) headers['Idempotency-Key'] = key;
      if (raw) headers['Content-Type'] = 'application/json';

      let res;
      try {
        res = await fetchImpl(origin + pathWithQuery, { method: m, headers, body: raw || undefined, signal: AbortSignal.timeout(timeoutMs) });
      } catch (err) {
        if (attempt < maxRetries) {
          log(`응답 없음(${err.name}) → 같은 Idempotency-Key로 ${backoffMs(attempt)}ms 뒤 재시도`);
          await realSleep(backoffMs(attempt));
          continue;
        }
        const e = new Error(`응답을 받지 못했습니다(${err.message}). POST는 같은 Idempotency-Key로 다시 보내세요.`, { cause: err });
        e.idempotencyKey = key || null;
        throw e;
      }

      const text = await res.text();
      let parsed = null;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        parsed = null; // 네트워크 앞단의 429 등은 JSON이 아닐 수 있다
      }
      const result = {
        status: res.status,
        requestId: res.headers.get('x-request-id'),
        replayed: res.headers.get('idempotent-replayed') === 'true',
        idempotencyKey: key || null,
        attempts: attempt + 1,
        body: parsed,
      };
      if (res.ok) return result;

      const retryable = parsed?.error ? parsed.error.retryable === true : FRONT_RETRYABLE_STATUS.has(res.status);
      if (!retryable || attempt >= maxRetries) return result;
      const retryAfter = Number(res.headers.get('retry-after') ?? '');
      // 하루 한도처럼 긴 Retry-After는 기다리지 않고 호출자에게 돌려준다
      if (Number.isFinite(retryAfter) && retryAfter > maxRetryAfterSec) return result;
      const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : backoffMs(attempt);
      log(`${res.status} ${parsed?.error?.code ?? '(본문 없음)'} → ${delay}ms 뒤 재시도(${attempt + 1}/${maxRetries})`);
      await realSleep(delay);
    }
  }

  return { call };
}

// ─── 자체 점검: 로컬 모의 서버(서버와 같은 서명 규칙 + 재전송 거부 + 멱등) ───────────────

const DOC_KEY_ID = 'pk_test_DocExample000001';
const DOC_SECRET = 'sk_test_TestSecretForDocumentationOnly0000000000000';

/** 테스트용 모의 서버. scenario(method, path, n번째 호출) → { status, body, headers } */
export function startMockServer({ keyId = DOC_KEY_ID, secret = DOC_SECRET, sign = signRequest, scenario }) {
  const seenSignatures = new Set();
  const calls = [];
  const server = createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks);
      const h = (n) => req.headers[n];
      const send = (status, body, headers = {}) => {
        res.writeHead(status, { 'X-Request-Id': `req_mock${calls.length}`, ...headers, ...(body ? { 'Content-Type': 'application/json' } : {}) });
        res.end(body ? JSON.stringify(body) : undefined);
      };
      const err = (status, code, retryable, headers) =>
        send(status, { request_id: 'req_mock', error: { code, message: code, user_message: { ko: '', en: '' }, retryable, related: {} } }, headers);
      const ts = h('x-moa-timestamp');
      const sig = String(h('x-moa-signature') ?? '');
      const idem = h('idempotency-key') ?? '';
      calls.push({ method: req.method, path: req.url, ts, sig, idem });
      if (h('x-moa-key-id') !== keyId || !ts || !sig) return err(401, 'authentication_failed', false);
      if (Math.abs(Math.floor(Date.now() / 1000) - Number(ts)) > 300) return err(401, 'authentication_failed', false);
      if (sign(secret, ts, req.method, req.url, idem, raw) !== sig.trim().toLowerCase()) return err(401, 'authentication_failed', false);
      const fp = `${keyId}|${ts}|${sig}`;
      if (seenSignatures.has(fp)) return err(401, 'authentication_failed', false); // 같은 서명 재전송
      seenSignatures.add(fp);
      if (req.method === 'POST' && !idem) return err(400, 'invalid_request', false);
      const n = calls.filter((c) => c.method === req.method && c.path === req.url).length;
      const out = scenario(req.method, req.url, n);
      if (out.error) return err(out.status, out.error, out.retryable, out.headers);
      return send(out.status, out.body, out.headers);
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, calls, url: `http://127.0.0.1:${server.address().port}` })));
}

export async function selfTest(log = console.log) {
  const { server, calls, url } = await startMockServer({
    scenario(method, path, n) {
      if (method === 'POST' && path === '/partner/v1/members') {
        return n === 1 ? { status: 503, error: 'issuer_unavailable', retryable: true } : { status: 201, body: { request_id: 'req_mock', data: { member_id: 'mem_mock' } } };
      }
      if (path === '/partner/v1/products' && n === 1) return { status: 429, headers: { 'Retry-After': '1' } }; // JSON 없는 앞단 429
      if (path === '/partner/v1/cards/card_mock/topup-orders') return { status: 422, error: 'card_not_active', retryable: false };
      return { status: 200, body: { request_id: 'req_mock', data: { ok: true } } };
    },
  });
  const moa = createPartnerClient({ keyId: DOC_KEY_ID, secret: DOC_SECRET, baseUrl: url });
  const checks = [];
  try {
    const post = await moa.call('POST', '/members', { email: 'user@example.com', partner_member_id: 'u-1029' });
    const posts = calls.filter((c) => c.method === 'POST' && c.path === '/partner/v1/members');
    checks.push(['503(retryable) 뒤 같은 Idempotency-Key로 재시도해 201', post.status === 201 && post.attempts === 2 && posts.length === 2 && posts[0].idem === posts[1].idem]);
    checks.push(['재시도는 새 시각·새 서명', posts.length === 2 && posts[0].ts !== posts[1].ts && posts[0].sig !== posts[1].sig]);

    const g1 = await moa.call('GET', '/ping');
    const g2 = await moa.call('GET', '/ping');
    const pings = calls.filter((c) => c.path === '/partner/v1/ping');
    checks.push(['같은 GET을 연달아 보내도 재전송(401)이 아님', g1.status === 200 && g2.status === 200 && pings[0].ts !== pings[1].ts]);
    checks.push(['GET에는 Idempotency-Key가 없음', pings.every((c) => c.idem === '')]);

    const products = await moa.call('GET', '/products');
    checks.push(['JSON 없는 429 + Retry-After 뒤 재시도', products.status === 200 && products.attempts === 2]);

    const q = await moa.call('GET', '/transactions', undefined, { query: { card_id: 'card_x', type: 'payment,refund', from: '2026-11-06T00:00:00+09:00' } });
    const qCall = calls.at(-1);
    checks.push(['query 객체를 인코딩한 문자열로 서명·요청(+는 %2B)', q.status === 200 && qCall.path.includes('from=2026-11-06T00%3A00%3A00%2B09%3A00')]);

    const topup = await moa.call('POST', '/cards/card_mock/topup-orders', { asset: 'USDT', network: 'TRON', wallet_address: 'T' });
    checks.push(['422(업무 오류)는 재시도하지 않음', topup.status === 422 && topup.attempts === 1 && topup.body?.error?.code === 'card_not_active']);
  } finally {
    server.close();
  }
  let ok = true;
  for (const [name, pass] of checks) {
    ok &&= pass;
    log(`${pass ? 'PASS' : 'FAIL'}  ${name}`);
  }
  return ok;
}

// ─── CLI ─────────────────────────────────────────────────────────────────

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      'idempotency-key': { type: 'string' },
      'self-test': { type: 'boolean', default: false },
    },
  });
  if (values['self-test']) return (await selfTest()) ? 0 : 1;
  const [method, path, body] = positionals;
  if (!method || !path) {
    console.error("사용법: node partner_client.mjs <GET|POST> <경로> ['<JSON 본문>'] [--idempotency-key <키>]");
    return 2;
  }
  if (!process.env.MOA_PARTNER_KEY_ID || !process.env.MOA_PARTNER_SECRET) {
    console.error('환경변수 MOA_PARTNER_KEY_ID, MOA_PARTNER_SECRET을 설정하세요(값은 출력하지 않습니다).');
    return 2;
  }
  if (body !== undefined) JSON.parse(body); // 형식 확인(보내는 바이트는 입력 그대로)
  const moa = createPartnerClient({ log: (m) => console.error(m) });
  const r = await moa.call(method, path, body, { idempotencyKey: values['idempotency-key'] });
  console.log(JSON.stringify(r, null, 2));
  return r.status >= 200 && r.status < 300 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(
    (code) => (process.exitCode = code),
    (err) => {
      console.error(err.message, err.idempotencyKey ? `(Idempotency-Key: ${err.idempotencyKey})` : '');
      process.exitCode = 1;
    },
  );
}
