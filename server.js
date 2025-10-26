const http = require('http');
const fs = require('fs');
const path = require('path');
const port = 3000;
const root = __dirname;

// 安全配置
const SECURITY_CONFIG = {
  maxRequestsPerMinute: 60,  // 每分钟最大请求数
  maxRequestsPerHour: 1000,  // 每小时最大请求数
  blockedIPs: new Set(),     // 被封禁的IP
  allowedIPs: new Set([      // IP白名单（可选）
    '127.0.0.1',
    '::1',
    '10.70.253.91'  // 本机IP
  ]),
  logAccess: true,           // 是否记录访问日志
  hideServerInfo: true       // 隐藏服务器信息
};

// 访问频率限制
const rateLimiter = new Map();

// 清理过期的访问记录
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of rateLimiter.entries()) {
    // 清理1小时前的记录
    data.requests = data.requests.filter(time => now - time < 3600000);
    if (data.requests.length === 0) {
      rateLimiter.delete(ip);
    }
  }
}, 300000); // 每5分钟清理一次

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8'
};

// 获取客户端真实IP
function getClientIP(req) {
  return req.headers['x-forwarded-for'] || 
         req.headers['x-real-ip'] || 
         req.connection.remoteAddress || 
         req.socket.remoteAddress ||
         (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
         '127.0.0.1';
}

// 访问日志记录
function logAccess(ip, method, url, status, userAgent = '') {
  if (!SECURITY_CONFIG.logAccess) return;
  
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${ip} ${method} ${url} ${status} "${userAgent}"`;
  console.log(logEntry);
}

// 检查访问频率限制
function checkRateLimit(ip) {
  const now = Date.now();
  
  if (!rateLimiter.has(ip)) {
    rateLimiter.set(ip, { requests: [] });
  }
  
  const data = rateLimiter.get(ip);
  data.requests.push(now);
  
  // 检查最近1分钟的请求数
  const recentRequests = data.requests.filter(time => now - time < 60000);
  if (recentRequests.length > SECURITY_CONFIG.maxRequestsPerMinute) {
    return { allowed: false, reason: '请求过于频繁，请稍后再试' };
  }
  
  // 检查最近1小时的请求数
  const hourlyRequests = data.requests.filter(time => now - time < 3600000);
  if (hourlyRequests.length > SECURITY_CONFIG.maxRequestsPerHour) {
    return { allowed: false, reason: '小时请求限制已达上限' };
  }
  
  return { allowed: true };
}

// 安全响应函数
function send(resp, status, headers, body) {
  // 添加安全头
  const securityHeaders = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    ...headers
  };
  
  // 隐藏服务器信息
  if (SECURITY_CONFIG.hideServerInfo) {
    delete securityHeaders['Server'];
  }
  
  resp.writeHead(status, securityHeaders);
  resp.end(body);
}

const server = http.createServer((req, res) => {
  const clientIP = getClientIP(req);
  const userAgent = req.headers['user-agent'] || '';
  const method = req.method;
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  
  // 安全检查：检查是否被封禁
  if (SECURITY_CONFIG.blockedIPs.has(clientIP)) {
    logAccess(clientIP, method, urlPath, 403, userAgent);
    send(res, 403, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Access Denied');
    return;
  }
  
  // 安全检查：访问频率限制
  const rateLimitResult = checkRateLimit(clientIP);
  if (!rateLimitResult.allowed) {
    logAccess(clientIP, method, urlPath, 429, userAgent);
    send(res, 429, { 
      'Content-Type': 'text/plain; charset=utf-8',
      'Retry-After': '60'
    }, rateLimitResult.reason);
    return;
  }
  
  // 安全检查：只允许GET和HEAD请求
  if (method !== 'GET' && method !== 'HEAD') {
    logAccess(clientIP, method, urlPath, 405, userAgent);
    send(res, 405, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Method Not Allowed');
    return;
  }
  
  // 安全检查：防止路径遍历攻击
  if (urlPath.includes('..') || urlPath.includes('~')) {
    logAccess(clientIP, method, urlPath, 400, userAgent);
    send(res, 400, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Bad Request');
    return;
  }
  
  let filePath = path.join(root, urlPath);
  if (urlPath === '/' || !path.extname(urlPath)) {
    filePath = path.join(root, 'index.html');
  }
  
  // 确保文件在根目录内
  const resolvedPath = path.resolve(filePath);
  const resolvedRoot = path.resolve(root);
  if (!resolvedPath.startsWith(resolvedRoot)) {
    logAccess(clientIP, method, urlPath, 403, userAgent);
    send(res, 403, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Access Denied');
    return;
  }
  
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      logAccess(clientIP, method, urlPath, 404, userAgent);
      send(res, 404, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Not Found');
      return;
    }
    
    const ext = path.extname(filePath).toLowerCase();
    const type = types[ext] || 'application/octet-stream';
    
    fs.readFile(filePath, (err2, buf) => {
      if (err2) {
        logAccess(clientIP, method, urlPath, 500, userAgent);
        send(res, 500, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Internal Server Error');
        return;
      }
      
      logAccess(clientIP, method, urlPath, 200, userAgent);
      send(res, 200, { 'Content-Type': type }, buf);
    });
  });
});

server.listen(port, '0.0.0.0', () => {
  console.log(`🚀 安全游戏服务器已启动！`);
  console.log(`📍 本地访问: http://localhost:${port}/`);
  console.log(`🌐 局域网访问: http://10.70.253.91:${port}/`);
  console.log(`🔒 安全功能已启用:`);
  console.log(`   ✅ 访问频率限制: ${SECURITY_CONFIG.maxRequestsPerMinute}/分钟, ${SECURITY_CONFIG.maxRequestsPerHour}/小时`);
  console.log(`   ✅ 路径遍历防护`);
  console.log(`   ✅ 访问日志记录`);
  console.log(`   ✅ 安全响应头`);
  console.log(`   ✅ IP封禁系统`);
  console.log(`⚠️  外网访问提醒:`);
  console.log(`   - 确保路由器已开放端口 ${port}`);
  console.log(`   - 建议仅在必要时开放外网访问`);
  console.log(`   - 定期检查访问日志`);
  console.log(`📊 访问日志格式: [时间] IP 方法 路径 状态码 "用户代理"`);
});
