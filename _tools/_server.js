/* =============================================================================
   خادم اختبار مشترك — _tools/_server.js
   =============================================================================
   لماذا لا نستخدم `python -m http.server` كما كان؟
   -----------------------------------------------------------------------------
   كان في الاختبارات **مسار بايثون ثابت على Windows**:
       C:\Users\ahmdz\.dsh\dsh-runtimes\...\python.exe
   وهذا يجعل الاختبار يفشل على أي جهاز آخر — ومنها خادم CI على Linux،
   حيث لا وجود لهذا المسار أصلاً.

   ولماذا عملية منفصلة؟
   -----------------------------------------------------------------------------
   الاختبارات تستدعي Chrome بـ`execFileSync`، وهو **يُجمّد حلقة أحداث Node**
   حتى ينتهي Chrome. فلو كان الخادم في العملية نفسها لما قبل أي اتصال،
   ولانتظر Chrome استجابة لا تأتي أبداً حتى انتهاء المهلته — بلا رسالة مفيدة.

   لذلك نُشغّل الخادم كعملية Node منفصلة (`_serve_test.js`)، وننتظر سطر
   الجاهزية، ثم نغلقه دائماً.
   ============================================================================= */
'use strict';

const net = require('net');
const path = require('path');
const { spawn } = require('child_process');

const SERVER_SCRIPT = path.join(__dirname, '_serve_test.js');
const ROOT = path.resolve(__dirname, '..');

/**
 * يُشغّل خادم اختبار كعملية منفصلة وينتظر جاهزيته.
 * @param {object} [opts] { root, port, timeout }
 * @returns {Promise<{url:string, port:number, close:Function, child:object}>}
 */
function start(opts) {
  opts = opts || {};
  const root = opts.root || ROOT;
  const timeout = opts.timeout || 20000;

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SERVER_SCRIPT, String(opts.port || 0), root], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let buf = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { child.kill(); } catch (e) { /* تجاهل */ }
      reject(new Error('الخادم لم يُعلن جاهزيته خلال ' + timeout + ' ms'));
    }, timeout);

    function onData(d) {
      buf += d.toString();
      const m = /TEST_SERVER_READY (\d+)/.exec(buf);
      if (m && !settled) {
        settled = true;
        clearTimeout(timer);
        const port = +m[1];
        resolve({
          url: 'http://127.0.0.1:' + port,
          port: port,
          child: child,
          close() { try { child.kill(); } catch (e) { /* تجاهل */ } },
        });
      }
      const e = /TEST_SERVER_ERROR (.+)/.exec(buf);
      if (e && !settled) {
        settled = true;
        clearTimeout(timer);
        try { child.kill(); } catch (err) { /* تجاهل */ }
        reject(new Error('فشل الخادم: ' + e[1]));
      }
    }

    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', err => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
    child.on('exit', code => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error('انتهى الخادم مبكراً برمز ' + code + (buf ? ' — ' + buf.trim() : '')));
    });
  });
}

/**
 * ينتظر أن يستجيب عنوان فعلاً (طبقة تأكيد إضافية).
 * @param {string} url
 * @param {number} [timeoutMs]
 */
function waitFor(url, timeoutMs) {
  const { hostname, port } = new URL(url);
  const t0 = Date.now();
  return new Promise((resolve, reject) => {
    (function attempt() {
      const sock = net.connect({ host: hostname, port: +port });
      let settled = false;
      sock.on('connect', () => { settled = true; sock.destroy(); resolve(); });
      sock.on('error', () => {
        if (settled) return;
        sock.destroy();
        if (Date.now() - t0 > (timeoutMs || 15000)) reject(new Error('الخادم لم يستجب على ' + url));
        else setTimeout(attempt, 120);
      });
    })();
  });
}

module.exports = { start, waitFor, SERVER_SCRIPT };
