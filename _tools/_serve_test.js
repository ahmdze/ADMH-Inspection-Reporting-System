#!/usr/bin/env node
/* =============================================================================
   خادم اختبار — يعمل كعملية منفصلة
   =============================================================================
   لماذا عملية منفصلة؟
   -----------------------------------------------------------------------------
   الاختبارات تستدعي Chrome بـ`execFileSync`، و`execFileSync` **يُجمّد حلقة
   أحداث Node** حتى ينتهي Chrome. فلو كان خادم HTTP في العملية نفسها، لما
   استطاع قبول أي اتصال — وChrome ينتظر استجابة لا تأتي أبداً، فينتهي بمهلة
   ٢٠ ثانية بلا أي رسالة مفيدة.

   (خادم بايثون كان يعمل لأنه عملية منفصلة بحكم كونه برنامجاً آخر.)

   الاستخدام:
     node _tools/_serve_test.js <port> [root]
   يطبع سطراً واحداً عند الجاهزية: TEST_SERVER_READY <port>
   ============================================================================= */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const port = parseInt(process.argv[2], 10) || 0;
const root = process.argv[3] ? path.resolve(process.argv[3]) : path.resolve(__dirname, '..');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

/* مسارات لا يجوز تقديمها */
const BLOCKED = /(^|[\\/])(\.git|\.github|node_modules|_tools)([\\/]|$)/i;

const server = http.createServer((req, res) => {
  let rel;
  try { rel = decodeURIComponent(req.url.split('?')[0]); }
  catch (e) { res.writeHead(400); res.end('bad url'); return; }
  if (rel === '/' || rel === '') rel = '/index.html';

  if (BLOCKED.test(rel)) {
    const b = Buffer.from('blocked');
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': b.length });
    res.end(b);
    return;
  }

  const full = path.join(root, rel);
  if (!full.startsWith(root)) {
    const b = Buffer.from('forbidden');
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': b.length });
    res.end(b);
    return;
  }

  fs.readFile(full, (err, data) => {
    if (err) {
      const b = Buffer.from('not found');
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': b.length });
      res.end(b);
      return;
    }
    /* Content-Length إلزامي: بدونه يتعلّق Chrome مع --virtual-time-budget */
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(full).toLowerCase()] || 'application/octet-stream',
      'Content-Length': data.length,
      'Cache-Control': 'no-store',
      'Connection': 'close',
    });
    res.end(data);
  });
});

server.listen(port, '127.0.0.1', () => {
  /* سطر الجاهزية — يقرأه الاختبار */
  process.stdout.write('TEST_SERVER_READY ' + server.address().port + '\n');
});

server.on('error', err => {
  process.stderr.write('TEST_SERVER_ERROR ' + err.message + '\n');
  process.exit(1);
});

/* إن مات الأب، نموت معه */
process.on('disconnect', () => process.exit(0));
