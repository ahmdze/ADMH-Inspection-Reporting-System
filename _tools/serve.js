#!/usr/bin/env node
/* =============================================================================
   خادم تطوير محلي — _tools/serve.js
   =============================================================================
   نحتاجه لأن التطبيق يستخدم agent الخدمة (Service Worker) و`manifest`،
   وكلاهما **لا يعمل عبر file://**. هذا الخادم بلا أي تبعية خارجية.

     node _tools/serve.js            → http://localhost:5000
     node _tools/serve.js 8080       → منفذ مخصّص
   ============================================================================= */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = parseInt(process.argv[2], 10) || 5000;

/* أنواع المحتوى — المهم منها صحيح، والباقي احتياط */
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
  '.woff2': 'font/woff2',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

/* ملفات لا يجوز تقديمها إطلاقاً من خادم التطوير */
const BLOCKED = /(^|[\\/])(\.git|\.github|_tools|نماذج|node_modules)([\\/]|$)/i;

const server = http.createServer((req, res) => {
  let rel;
  try {
    rel = decodeURIComponent(req.url.split('?')[0]);
  } catch (e) {
    res.writeHead(400); res.end('رابط غير صالح'); return;
  }
  if (rel === '/' || rel === '') rel = '/index.html';

  const full = path.join(ROOT, rel);

  /* حماية من الخروج خارج الجذر */
  if (!full.startsWith(ROOT)) {
    res.writeHead(403); res.end('ممنوع'); return;
  }
  if (BLOCKED.test(rel)) {
    res.writeHead(403); res.end('هذا المسار غير مُتاح من خادم التطوير');
    return;
  }

  fs.readFile(full, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('غير موجود: ' + rel);
      return;
    }
    const type = TYPES[path.extname(full).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': type,
      /* لا تخزين مؤقت: يمنع الالتباس عند التطوير */
      'Cache-Control': 'no-store',
    });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log('خادم التطوير يعمل:');
  console.log('  http://localhost:' + PORT);
  console.log('');
  console.log('لتثبيت التطبيق على الهاتف، استخدم عنوان جهازك في الشبكة بدل localhost.');
  console.log('لإيقافه: Ctrl+C');
});
