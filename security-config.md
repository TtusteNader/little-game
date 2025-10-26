# 🔒 游戏服务器安全配置说明

## 当前安全功能

### ✅ 已启用的防护措施

1. **访问频率限制**
   - 每分钟最大请求数：60次
   - 每小时最大请求数：1000次
   - 超出限制将返回429状态码

2. **IP封禁系统**
   - 支持手动封禁恶意IP
   - 自动清理过期访问记录

3. **路径遍历防护**
   - 防止 `../` 和 `~` 路径攻击
   - 确保文件访问仅限于游戏目录

4. **HTTP方法限制**
   - 仅允许GET和HEAD请求
   - 拒绝POST、PUT、DELETE等危险方法

5. **安全响应头**
   - `X-Content-Type-Options: nosniff`
   - `X-Frame-Options: DENY`
   - `X-XSS-Protection: 1; mode=block`
   - `Referrer-Policy: strict-origin-when-cross-origin`

6. **访问日志记录**
   - 记录所有访问请求
   - 包含IP、时间、路径、状态码、用户代理

## 🛡️ 安全建议

### 基本安全措施
- ✅ 定期检查访问日志
- ✅ 监控异常访问模式
- ✅ 仅在必要时开放外网访问
- ✅ 使用强密码保护路由器

### 高级安全措施
- 🔧 考虑使用HTTPS（需要SSL证书）
- 🔧 设置防火墙规则
- 🔧 使用VPN进行远程访问
- 🔧 定期更新系统和软件

## ⚙️ 自定义配置

如需修改安全设置，请编辑 `server.js` 中的 `SECURITY_CONFIG` 对象：

```javascript
const SECURITY_CONFIG = {
  maxRequestsPerMinute: 60,    // 每分钟最大请求数
  maxRequestsPerHour: 1000,    // 每小时最大请求数
  blockedIPs: new Set(),       // 被封禁的IP列表
  allowedIPs: new Set([        // IP白名单（可选）
    '127.0.0.1',
    '::1',
    '10.70.253.91'
  ]),
  logAccess: true,             // 是否记录访问日志
  hideServerInfo: true         // 隐藏服务器信息
};
```

## 🚨 紧急情况处理

### 如果发现恶意访问：
1. 记录恶意IP地址
2. 将IP添加到 `blockedIPs` 集合中
3. 重启服务器应用更改
4. 检查系统是否有其他异常

### 封禁IP示例：
```javascript
SECURITY_CONFIG.blockedIPs.add('恶意IP地址');
```

## 📊 日志分析

访问日志格式：
```
[时间戳] IP地址 HTTP方法 请求路径 状态码 "用户代理"
```

常见状态码含义：
- `200`: 成功访问
- `404`: 文件未找到
- `403`: 访问被拒绝
- `429`: 请求过于频繁
- `500`: 服务器内部错误

## 🔄 更新安全配置

修改配置后需要重启服务器：
1. 按 `Ctrl+C` 停止服务器
2. 运行 `node server.js` 重新启动
3. 确认新配置已生效

---

**注意**：此配置提供基本的安全防护，对于生产环境建议使用专业的Web服务器（如Nginx）和更完善的安全措施。