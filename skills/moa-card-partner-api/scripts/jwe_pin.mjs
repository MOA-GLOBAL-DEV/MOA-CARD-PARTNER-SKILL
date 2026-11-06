#!/usr/bin/env node
// PIN 암호화(JWE compact) 도구 — 테스트 환경 확인용 (Node.js 20 이상, 의존성: jose)
//   준비: 이 폴더에서 `npm i` (package.json의 jose) 또는 `npm i jose`
//
// ※ 운영에서는 PIN 암호화를 반드시 "회원 기기(앱)"에서 한다. 파트너사 서버는 평문 PIN을 받거나 저장·로그하면 안 된다.
//   이 스크립트는 테스트 환경에서 활성화(테스트 활성화 코드 123456)·PIN 변경을 시험하거나, 앱 구현 결과를 대조하는 용도다.
//
// 형식: 평문 {"pin":"NNNNNN"}(숫자 6자리 문자열), 헤더 alg RSA-OAEP-256 + enc A256GCM + kid(=GET /pin-encryption-key의 key_id), 압축(zip) 없음
//
// 사용법
//   node jwe_pin.mjs --pin 123456 --key-file pin-key.json   # pin-key.json = GET /pin-encryption-key 응답(또는 그 data)
//   node jwe_pin.mjs --pin 123456 --fetch                    # 공개키를 API로 받아 암호화(MOA_PARTNER_KEY_ID/SECRET 필요)
//   node jwe_pin.mjs --self-test                             # 로컬 RSA 키로 암호화→복호화 왕복과 서버 규칙 확인
//
// 모듈로 쓰기(앱·브라우저·React Native에서도 같은 코드)
//   import { encryptPin } from './jwe_pin.mjs';
//   const encrypted_pin = await encryptPin('123456', pinKey); // pinKey = GET /pin-encryption-key 의 data

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import * as jose from 'jose';

export const PIN_ALG = 'RSA-OAEP-256';
export const PIN_ENC = 'A256GCM';

/** pinKey = { key_id, algorithm, public_key(SPKI PEM) }. 반환값을 encrypted_pin으로 보낸다 */
export async function encryptPin(pin, pinKey) {
  if (!/^\d{6}$/.test(pin)) throw new Error('PIN은 숫자 6자리 문자열이어야 합니다');
  const publicKey = await jose.importSPKI(pinKey.public_key, PIN_ALG);
  return new jose.CompactEncrypt(new TextEncoder().encode(JSON.stringify({ pin })))
    .setProtectedHeader({ alg: PIN_ALG, enc: PIN_ENC, kid: pinKey.key_id })
    .encrypt(publicKey);
}

/**
 * 서버가 encrypted_pin을 받는 규칙을 그대로 흉내 낸 확인 함수(테스트용).
 * alg·enc 조합, kid(있으면 현재 key_id와 같아야 함), 복호화, {"pin":"NNNNNN"} 형식 중 하나라도 틀리면 422 pin_invalid
 */
export async function checkPinJweLikeServer(jwe, privateKey, expectedKid) {
  try {
    const header = jose.decodeProtectedHeader(jwe);
    if (header.alg !== PIN_ALG || header.enc !== PIN_ENC) return { ok: false, reason: 'alg/enc' };
    if (header.zip !== undefined) return { ok: false, reason: 'zip' };
    if (header.kid !== undefined && header.kid !== expectedKid) return { ok: false, reason: 'kid' };
    const { plaintext } = await jose.compactDecrypt(jwe, privateKey, { keyManagementAlgorithms: [PIN_ALG], contentEncryptionAlgorithms: [PIN_ENC] });
    const pin = JSON.parse(new TextDecoder().decode(plaintext))?.pin;
    if (typeof pin !== 'string' || !/^\d{6}$/.test(pin)) return { ok: false, reason: 'pin format' };
    return { ok: true, pin };
  } catch (e) {
    return { ok: false, reason: e.code ?? e.name };
  }
}

export async function selfTest(log = console.log) {
  const { publicKey, privateKey } = await jose.generateKeyPair(PIN_ALG, { modulusLength: 2048, extractable: true });
  const pinKey = { key_id: 'pin-1', algorithm: PIN_ALG, public_key: await jose.exportSPKI(publicKey) };
  const checks = [];

  const jwe = await encryptPin('123456', pinKey);
  const header = jose.decodeProtectedHeader(jwe);
  checks.push(['JWE compact 5부분', jwe.split('.').length === 5]);
  checks.push(['헤더 alg/enc/kid', header.alg === PIN_ALG && header.enc === PIN_ENC && header.kid === 'pin-1' && header.zip === undefined]);
  const back = await checkPinJweLikeServer(jwe, privateKey, 'pin-1');
  checks.push(['서버 규칙으로 복호화 → {"pin":"123456"}', back.ok && back.pin === '123456']);
  checks.push(['kid가 현재 key_id와 다르면 거절(pin_invalid)', !(await checkPinJweLikeServer(jwe, privateKey, 'pin-2')).ok]);

  const noKid = await new jose.CompactEncrypt(new TextEncoder().encode('{"pin":"654321"}')).setProtectedHeader({ alg: PIN_ALG, enc: PIN_ENC }).encrypt(publicKey);
  checks.push(['kid가 없으면 현재 키로 복호화', (await checkPinJweLikeServer(noKid, privateKey, 'pin-1')).ok]);

  const badPin = await new jose.CompactEncrypt(new TextEncoder().encode('{"pin":"12345"}')).setProtectedHeader({ alg: PIN_ALG, enc: PIN_ENC, kid: 'pin-1' }).encrypt(publicKey);
  checks.push(['6자리가 아닌 PIN은 거절', !(await checkPinJweLikeServer(badPin, privateKey, 'pin-1')).ok]);

  let refused = false;
  try {
    await encryptPin('12a456', pinKey);
  } catch {
    refused = true;
  }
  checks.push(['encryptPin은 숫자 6자리가 아니면 암호화하지 않음', refused]);

  let ok = true;
  for (const [name, pass] of checks) {
    ok &&= pass;
    log(`${pass ? 'PASS' : 'FAIL'}  ${name}`);
  }
  return ok;
}

async function main() {
  const { values } = parseArgs({
    options: {
      pin: { type: 'string' },
      'key-file': { type: 'string' },
      fetch: { type: 'boolean', default: false },
      'self-test': { type: 'boolean', default: false },
    },
  });
  if (values['self-test']) return (await selfTest()) ? 0 : 1;
  if (!values.pin || (!values['key-file'] && !values.fetch)) {
    console.error('사용법: node jwe_pin.mjs --pin <6자리> (--key-file pin-key.json | --fetch)');
    return 2;
  }
  let pinKey;
  if (values.fetch) {
    const { createPartnerClient } = await import('./partner_client.mjs');
    const r = await createPartnerClient().call('GET', '/pin-encryption-key');
    if (r.status !== 200) {
      console.error(`GET /pin-encryption-key 실패: ${r.status} ${r.body?.error?.code ?? ''} (X-Request-Id ${r.requestId})`);
      return 1;
    }
    pinKey = r.body.data;
  } else {
    const json = JSON.parse(readFileSync(values['key-file'], 'utf8'));
    pinKey = json.data ?? json;
  }
  if (!pinKey?.key_id || !pinKey?.public_key) {
    console.error('공개키 형식이 아닙니다: { key_id, algorithm, public_key }가 필요합니다.');
    return 2;
  }
  console.error('주의: 테스트 환경 확인용입니다. 운영에서는 회원 기기에서 암호화하고, 파트너사 서버는 평문 PIN을 다루지 않습니다.');
  console.log(await encryptPin(values.pin, pinKey));
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(
    (code) => (process.exitCode = code),
    (err) => {
      console.error(err.message);
      process.exitCode = 1;
    },
  );
}
