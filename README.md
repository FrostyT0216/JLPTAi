# JLPT 読解トレーナー

AI 生成的 JLPT 阅读专项练习 WebApp。纯本地静态运行，面向 iOS「添加到主屏幕」使用，
数据长期保存在本机。功能与验收标准见 [要求文档.md](要求文档.md)。

## 快速开始

```bash
node server.js        # 默认 http://localhost:8080，可改端口：node server.js 9000
```

（任何静态服务器均可，如 `python -m http.server`、`npx serve`。）

### iPhone 上使用

1. iPhone 与电脑连同一 Wi-Fi，Safari 访问 `http://<电脑局域网IP>:8080`；
2. Safari 分享菜单 → **添加到主屏幕** → 以全屏独立 App 运行；
3. 首次进入「设置」页：选择服务商预设、粘贴 API Key → **测试连接**；
4. 回到首页：选难度（N5–N1）→ 模式（**整套模拟** / **专项练习**）→ 开始生成。

> API 请求由浏览器直接发往你配置的 AI 服务商，请确认该服务允许跨域（CORS）。
> 服务商预设：OpenAI / DeepSeek / 智谱 GLM / OpenRouter / 自定义。

## 功能一览

- **整套模拟**：按级别生成接近真实考试読解部分的一整套题（短文/中文/長文/情報検索组合，N5 5問 → N1 16問）。
- **专项练习**：指定题型与题量（5/10/15 問）。
- 逐篇生成、实时进度、失败自动重试；`response_format` 强制 JSON + 提示词约束 + 容错解析三重保障。
- 考试页：JLPT 风格 4 选 1、进度条、中途退出自动存草稿、下次可继续。
- 结果页：得分、逐篇得分、逐题解析（你的答案 / 正确答案 / 日语解说）。
- 记录页：GitHub 风格每日正确率热力图（可切换年份）、累计天数/答题数/正确率/连续打卡、历史列表可回看试卷。
- 设置页：API 配置、测试连接、清空数据。深色模式跟随系统。

## 数据存储（全部在本机 localStorage）

| Key | 内容 |
|---|---|
| `jlpt.settings.v1` | API 地址 / Key / 模型 / 温度 / JSON 开关 |
| `jlpt.records.v1` | 每次练习的成绩记录 |
| `jlpt.exams.v1` | 最近 20 套试卷（供结果回看） |
| `jlpt.draft.v1` | 未完成考试草稿 |

## 目录结构

```
index.html            单页应用入口
css/style.css         iOS HIG 风格样式（含深色模式、安全区适配）
js/storage.js         localStorage 存储层
js/api.js             OpenAI 兼容 API 客户端 + JSON 容错解析
js/generator.js       试题生成器（逐篇生成/校验/重试/计分）
js/heatmap.js         GitHub 风格热力图组件
js/app.js             界面路由与业务流程
sw.js                 Service Worker（App Shell 离线缓存，需 HTTPS 或 localhost）
manifest.webmanifest  PWA 清单
icons/                应用图标（node scripts/gen-icons.js 重新生成）
server.js             零依赖本地静态服务器
```

## 说明

- Service Worker 离线缓存仅在 `https://` 或 `localhost` 下生效；局域网 HTTP 直接访问不影响任何功能，
  只是断网后无法打开页面外壳。
- API Key 仅保存在本机浏览器中，只随请求发往你配置的 API 地址。
