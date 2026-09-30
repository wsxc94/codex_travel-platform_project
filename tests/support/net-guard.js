'use strict';
/**
 * 테스트 전용 프리로드: node --require tests/support/net-guard.js server.js
 *
 * 서버 자식 프로세스의 외부 네트워크 호출을 모두 가짜 서버(TEST_EXTERNAL_PROXY)로 돌린다.
 *  - localhost/127.0.0.1 요청은 그대로 보낸다(가짜 벤더 서버).
 *  - 그 밖의 호스트는 `${TEST_EXTERNAL_PROXY}/<proto>/<host><path>?<query>` 로 바꿔 보낸다.
 *    가짜 서버가 무료 공개 API(환율·날씨)는 가짜 응답을 주고, 나머지는 "예상 밖 외부 호출"로 기록한다.
 *  - http/https 모듈로 외부에 직접 나가는 요청은 막는다(서버는 fetch만 쓴다).
 * 운영 코드는 이 파일을 불러오지 않는다.
 */
const { URL } = require('url');

const target = String(process.env.TEST_EXTERNAL_PROXY || '').replace(/\/+$/, '');
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function isLocalHost(hostname) {
  return LOCAL_HOSTS.has(String(hostname || '').toLowerCase());
}

if (target && typeof globalThis.fetch === 'function') {
  const realFetch = globalThis.fetch;
  globalThis.fetch = function guardedFetch(input, init) {
    let url;
    try {
      const raw = (typeof input === 'string' || input instanceof URL) ? String(input) : String(input && input.url);
      url = new URL(raw);
    } catch {
      return realFetch(input, init);
    }
    if (isLocalHost(url.hostname)) return realFetch(input, init);
    const redirected = `${target}/${url.protocol.replace(/:$/, '')}/${url.host}${url.pathname}${url.search}`;
    return realFetch(redirected, init);
  };

  for (const modName of ['http', 'https']) {
    const mod = require(modName);
    for (const fn of ['request', 'get']) {
      const original = mod[fn];
      mod[fn] = function guardedRequest(...args) {
        const first = args[0];
        let hostname = 'localhost';
        if (typeof first === 'string' || first instanceof URL) {
          try { hostname = new URL(String(first)).hostname; } catch { hostname = 'localhost'; }
        } else if (first && typeof first === 'object') {
          hostname = String(first.hostname || first.host || 'localhost').replace(/:\d+$/, '');
        }
        if (!isLocalHost(hostname)) {
          throw new Error(`[net-guard] 테스트 중 외부 ${modName}.${fn} 호출 차단: ${hostname}`);
        }
        return original.apply(this, args);
      };
    }
  }
}
