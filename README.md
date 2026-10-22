# Inshelf · JavDB Emby 入库检测

在 [JavDB](https://javdb.com) 的列表页、详情页直接显示：这部影片**是否已经收入你的 Emby 媒体库**。已入库的绿色徽标可以点击，直接打开 Emby 里对应的影片。

这是一个 Tampermonkey（篡改猴）用户脚本。它只读取你的 Emby 媒体库，不会修改、删除、下载或播放任何东西。

> 当前版本：`0.1.0`。支持 **JavDB + Emby**。代码按适配器架构编写，后续可以加 JavBus、MissAV、Jellyfin 等，见[如何新增适配器](#如何新增适配器)。

---

## 效果

| 页面        | 显示                  |
| --------- | ------------------- |
| JavDB 列表页 | 每张影片卡片标题旁出现一个小徽标    |
| JavDB 详情页 | 影片信息下方出现一行状态 + 跳转链接 |

徽标含义：

| 徽标            | 含义               | 能做什么             |
| ------------- | ---------------- | ---------------- |
| 绿色 `✓ 已入库`    | Emby 里找到了这个番号    | 点击打开 Emby 影片详情   |
| 灰色 `未入库`      | 索引正常、识别率正常，确实没找到 | 详情页可点「在 Emby 搜索」 |
| 黄色 `无法判断`     | 文件名大多不含番号，或缓存过期  | 不误报「未入库」         |
| 蓝色 `检测中…`     | 正在首次同步/刷新媒体库     | 稍等               |
| 橙色 `配置 Emby`  | 还没填地址或 API Key   | 点击打开设置           |
| 红色 `Emby 未连接` | 地址、Key、网络或证书有问题  | 点击打开设置           |

> 为什么不是简单的「在库 / 不在库」？因为 Emby 里很多文件名是中文标题，根本不含番号。脚本会计算「能识别出番号的比例」，比例太低时显示「无法判断」，避免把明明在库的影片误报成「未入库」。

---

## 安装

### 1. 安装 Tampermonkey

- Chrome / Edge：打开 [Chrome 应用商店的 Tampermonkey](https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)，点「添加至 Chrome」。
- Firefox：打开 [Firefox 附加组件](https://addons.mozilla.org/firefox/addon/tampermonkey/)，点「添加到 Firefox」。
- Safari：需要安装 [Userscripts](https://apps.apple.com/app/userscripts/id1463298887) 之类的扩展，本脚本未专门测试。

安装后，浏览器右上角会出现 Tampermonkey 图标。

### 2. 安装脚本

脚本文件在本仓库的：

```text
dist/inshelf-javdb-emby.user.js
```

任选一种方式：

**方式 A：拖拽安装（推荐）**

1. Chrome/Edge 打开 `chrome://extensions`，找到 Tampermonkey，点「详情」，打开「允许访问文件网址」。
2. 把 `dist/inshelf-javdb-emby.user.js` 直接拖进浏览器窗口。
3. Tampermonkey 会弹出安装页，点「安装」。

**方式 B：复制粘贴**

1. 点 Tampermonkey 图标 →「管理面板」→「+」新建脚本。
2. 删掉编辑器里的默认内容，把 `dist/inshelf-javdb-emby.user.js` 的全部内容粘贴进去。
3. 按 `Ctrl+S`（macOS 是 `Cmd+S`）保存。

> 安装脚本**不需要** Node.js。Node 只在修改源码、重新构建时需要。

### 3. 更新

当前没有配置自动更新地址。更新时重新下载新的 `dist/inshelf-javdb-emby.user.js`，重复上面的安装步骤，Tampermonkey 会覆盖旧版本。

---

## 获取 Emby API Key

1. 用管理员账号打开 Emby 网页。
2. 右上角齿轮 →「设置」→ 左侧「高级」→「API 密钥」。
3. 点「新建 API 密钥」，名称填 `inshelf`（方便以后识别）。
4. 复制生成的那串 Key。

注意：

- API Key 相当于密码，**不要发到群里、不要截图给别人**。
- 如果你不是管理员，请让管理员帮你建一个 Key，或直接使用管理员 Key。
- 建议单独建一个 `inshelf` Key；以后不用了，在 Emby 里删掉即可，不影响其他设备。
- 非管理员 Key 可能读不到影片的 `Path` 字段，导致识别率很低。遇到这种情况，换一个有权限的 Key。

---

## 配置

1. 打开 JavDB（`https://javdb.com`），等页面加载完。
2. 右下角会出现一个圆形齿轮按钮，点它。
3. 填写：
   - **服务器地址**：例如 `http://192.168.1.10:8096`，或 `http://192.168.1.10:8096/emby`。脚本会自动尝试带 `/emby` 和不带 `/emby` 两种。
   - **API Key**：上一步复制的 Key。
   - **缓存时间**：默认 30 分钟。意思是 30 分钟内直接用本地索引，不重复拉库。
4. 点「测试连接」。成功会显示 Emby 的服务器名和版本。
5. 点「保存」。
6. 点「同步媒体库」。第一次会拉取全库，影片多时可能需要几十秒。
7. 回到 JavDB 列表/详情页，徽标会出现。

如果齿轮没出现：

- 确认当前网址是 `javdb.com` 或它的子域名。
- 确认 Tampermonkey 里脚本是「启用」状态。
- 刷新页面。
- 打开浏览器控制台（F12），看有没有 `Inshelf` 相关报错。

---

## 工作原理（简述）

1. 用你的 API Key 调用 Emby 的只读接口，分页拉取媒体库里所有 `Movie` / `Video` 的 `Path`、`Name`、`OriginalTitle`。
2. 从文件名、标题里提取番号（如 `ABC-123`、`FC2-PPV-1234567`）。
3. 在本地建立「番号 → Emby 影片」的索引，缓存在 Tampermonkey 存储里。
4. 打开 JavDB 时，从页面标题/详情信息里提取番号，直接查本地索引，所以很快。
5. 如果索引过期，后台静默刷新；刷新失败就继续用旧索引，并把未命中的显示为「无法判断」，而不是「未入库」。

为什么不用 Emby 的搜索接口逐个查？因为 Emby 的 `searchTerm` 只搜刮削后的名称，**不搜文件路径**。文件名里有番号、但 Emby 显示的是中文标题时，搜索会漏判。全库拉取一次再本地匹配更准，也更快。

---

## 常见问题

### 明明在 Emby 里，却显示「未入库」

按可能性排查：

1. **文件名不含番号**。例如文件叫 `SSIS-001 中文标题.mp4` 通常没问题；如果叫 `某个中文标题.mp4`，脚本无法从文件名识别。
2. **Emby 的 `Path` 字段没返回**。非管理员 Key 可能读不到路径，换管理员 Key。
3. **番号格式特殊**。脚本覆盖常见 `ABC-123`、`ABC123`、`FC2-PPV-1234567` 等；非常冷门的格式可能漏掉。
4. **索引还没同步完**。点齿轮 →「同步媒体库」，看状态行。
5. **缓存过期且刷新失败**。等网络恢复后重新同步。

最稳的办法：把文件名改成包含标准番号，例如 `ABC-123.mp4`，然后在 Emby 里重新扫描媒体库，再回脚本点同步。

### 显示「无法判断」

说明 Emby 里能识别出番号的影片比例低于 50%。常见于：文件名大量是纯中文、PureJAV 风格命名、或 API Key 没有路径权限。

这不是「不在库」，只是「不敢确定」。可以：

- 给文件改名，加入番号；
- 换有路径权限的 Key；
- 重新同步。

### 显示「Emby 未连接」

- **401 / 403**：API Key 错误、被删除、或没有权限。
- **404**：地址不对。多数 Emby 应填 `http://IP:8096` 或 `http://IP:8096/emby`，不要填 `/web/index.html`。
- **超时 / 网络错误**：检查 IP、端口、防火墙；手机/电脑是否和 Emby 在同一网络；Emby 是否在运行。
- **HTTPS 页面访问 HTTP Emby**：Tampermonkey 的 `GM_xmlhttpRequest` 通常能绕过混合内容限制；如果不行，给 Emby 配 HTTPS 反向代理。
- **自签名证书**：浏览器/Tampermonkey 可能拒绝。局域网建议直接用 HTTP，或安装受信任的证书。

### 同步很慢 / 卡住

- 脚本每页 1000 部，页间停 100ms，最多 50 页（5 万部）。
- 大库第一次同步几十秒是正常的。
- 超过 5 万部会截断，状态里会提示；这种情况建议只保留一个电影库，或以后用服务端方案。

### 会不会修改我的 Emby？

不会。脚本只调用只读 GET 接口：`/System/Info`、`/System/Info/Public`、`/Items`。不调用任何 POST/DELETE，不删除、不转码、不播放。

### API Key 存在哪？安全吗？

- 存在 Tampermonkey 的脚本存储里（`GM_setValue`），JavDB 页面本身的 JavaScript 读不到。
- 只会发送到你填写的 Emby 地址，不会发给第三方。
- 仍然建议：单独建 `inshelf` Key；公网访问 Emby 时用 HTTPS；不要多人共用管理员 Key。

### 支持 Jellyfin / Plex / JavBus / MissAV 吗？

当前版本只支持 **JavDB + Emby**。代码是适配器架构，新增网站或媒体服务器只需要加一个适配器文件，不需要改核心匹配逻辑。欢迎按下面的「如何新增适配器」提交 PR。

### JavDB 改版了，徽标不见了

选择器集中在 `src/sites/javdb.js` 顶部。改版后只需要更新选择器常量，重新 `npm run build`。如果你不会改，开 issue 并附上页面截图/HTML 片段。

### 为什么列表页有的卡片没有徽标？

- 标题里没有可识别的番号（例如演员名、合集、无码流出版）。
- 该卡片不是标准 `.movie-list .item` 结构。
- 脚本不会给识别不出番号的卡片硬塞徽标，避免误导。

---

## 隐私

- 不收集、不上传任何数据。
- 不包含统计、埋点、远程配置。
- 唯一的外部请求是你配置的 Emby 地址。
- 番号索引只存在本地浏览器里；点「清除缓存」可删除索引（配置保留）。

---

## 开发

### 环境

- Node.js 20+（本项目在 Node 24 上测试）。
- **零运行时依赖**，不需要 `npm install`。
- 构建产物是单文件，直接给 Tampermonkey 用。

### 命令

```bash
npm run build   # src/ -> dist/inshelf-javdb-emby.user.js
npm test        # Node 内置测试，22 个用例
npm run check   # build + test
```

### 目录

```text
.
├── dist/
│   └── inshelf-javdb-emby.user.js   # 构建产物，提交到 git，直接安装
├── scripts/
│   └── build.mjs                    # 零依赖拼接构建
├── src/
│   ├── userscript-header.txt        # Tampermonkey 元数据
│   ├── core/
│   │   ├── namespace.js             # globalThis.Inshelf
│   │   ├── codes.js                 # 番号提取/归一化/变体
│   │   ├── matcher.js               # 建索引/查询
│   │   └── state.js                 # 入库状态机
│   ├── sites/
│   │   ├── registry.js              # 站点适配器注册表
│   │   └── javdb.js                 # JavDB 选择器/解析
│   ├── servers/
│   │   ├── registry.js              # 服务器适配器注册表
│   │   ├── http.js                  # GM_xmlhttpRequest 封装
│   │   └── emby.js                  # Emby 只读 API
│   ├── ui/
│   │   ├── styles.js
│   │   ├── toast.js
│   │   ├── badges.js
│   │   └── settings.js
│   ├── storage.js                   # 配置/索引 + schema 迁移
│   ├── app.js                       # 扫描/同步/设置入口
│   └── main.js                      # 注册适配器并启动
├── tests/
│   ├── core.test.mjs
│   ├── adapters.test.mjs
│   └── build.test.mjs
├── CHANGELOG.md
├── LICENSE
└── README.md
```

### 构建规则

- 只改 `src/`，不要手改 `dist/`。
- 每个 `src/**/*.js` 是一个 IIFE，把导出挂到 `globalThis.Inshelf`，例如 `Inshelf.codes`、`Inshelf.sites.javdb`。
- 浏览器/油猴里没有 `module`，文件末尾的 `module.exports` 只给 Node 测试用。
- `scripts/build.mjs` 的 `ORDER` 决定拼接顺序；构建时会校验 `src/` 下每个 `.js` 都在 `ORDER` 里，漏了会报错。
- 新增文件后，记得同时更新 `ORDER`。

---

## 如何新增适配器

### 新增一个网站（site adapter）

以 `example.com` 为例：

1. 新建 `src/sites/example.js`：

```js
(function (root) {
  'use strict';
  var Inshelf = root.Inshelf = root.Inshelf || {};

  function parseCode(text) {
    var list = Inshelf.codes.extract(text || '');
    return list.length ? list[0] : null;
  }

  Inshelf.sites.example = {
    id: 'example',
    name: 'Example',
    hosts: [/example\.com/i],

    isActive: function (loc) {
      return /example\.com/i.test(loc.hostname || '');
    },
    isDetailPage: function (doc) {
      return !!(doc.querySelector && doc.querySelector('.video-detail'));
    },
    getDetailCode: function (doc) {
      var el = doc.querySelector('.video-detail .code');
      return el ? parseCode(el.textContent) : null;
    },
    getDetailMount: function (doc) {
      return doc.querySelector('.video-detail .info') || doc.querySelector('.video-detail');
    },
    getListItems: function (doc) {
      var out = [];
      var nodes = doc.querySelectorAll('.movie-list .item');
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        var title = el.querySelector('.video-title');
        var code = title ? parseCode(title.textContent) : null;
        if (code) out.push({ code: code, element: el, mount: title || el });
      }
      return out;
    },

    parseDetailCode: parseCode,
    parseListTitle: function (text) { return Inshelf.codes.extract(text || ''); }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Inshelf.sites.example;
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

1. 在 `scripts/build.mjs` 的 `ORDER` 里、`sites/javdb.js` 之后加一行：

```js
'src/sites/example.js',
```

1. 在 `src/main.js` 里注册：

```js
Inshelf.siteRegistry.register(Inshelf.sites.example);
```

1. 在 `src/storage.js` 的 `defaultConfig().sites` 里加：

```js
example: { enabled: true, showList: true, showDetail: true },
```

1. 在 `tests/adapters.test.mjs` 里给 `parseDetailCode` / `parseListTitle` 加纯函数测试。
2. `npm run check`，然后安装新的 `dist`。

> 站点适配器只负责「从 DOM 里拿番号、拿插入位置」，不负责匹配、状态、UI。这样加网站不会碰核心逻辑。

### 新增一个媒体服务器（server adapter）

以 `jellyfin` 为例：

1. 新建 `src/servers/jellyfin.js`，实现这些字段：

```js
Inshelf.servers.jellyfin = {
  id: 'jellyfin',
  name: 'Jellyfin',
  fields: [
    { key: 'baseUrl', label: '服务器地址', type: 'url', placeholder: 'http://192.168.1.10:8096' },
    { key: 'apiKey', label: 'API Key', type: 'password' },
    { key: 'ttlMinutes', label: '缓存时间（分钟）', type: 'select', options: [5, 15, 30, 60] }
  ],

  normalizeBaseUrl: function (input) { /* ... */ },

  // 返回 { ok, baseUrl, serverId, serverName, version, message }
  testConnection: async function (config, http) { /* ... */ },

  // 返回 { items: [{ id, name, originalTitle, path, year }], total, baseUrl }
  fetchLibrary: async function (config, http, onProgress) { /* ... */ },

  buildItemUrl: function (config, item) { /* ... */ }
};
```

1. 在 `scripts/build.mjs` 的 `ORDER` 里加 `'src/servers/jellyfin.js'`。
2. 在 `src/main.js` 里注册 `Inshelf.serverRegistry.register(Inshelf.servers.jellyfin);`。
3. 在 `src/storage.js` 的 `defaultConfig().servers` 里加默认配置。
4. 在 `tests/adapters.test.mjs` 用假 `http` 测试分页、401、URL 解析。
5. `npm run check`。

设置面板会根据 `fields` 自动生成表单；核心的番号解析、索引、状态机、徽标都不需要改。

### 适配器契约（简版）

站点适配器必须提供：

```js
{
  id, name, hosts,
  isActive(location),
  isDetailPage(document),
  getDetailCode(document),      // string | null
  getDetailMount(document),     // Element | null
  getListItems(document),       // [{ code, element, mount }]
  parseDetailCode(text),        // 纯函数，测试用
  parseListTitle(text)          // 纯函数，测试用
}
```

服务器适配器必须提供：

```js
{
  id, name, fields,
  normalizeBaseUrl(input),
  testConnection(config, http),          // -> { ok, baseUrl, serverId, serverName, version }
  fetchLibrary(config, http, onProgress),// -> { items, total, baseUrl }
  buildItemUrl(config, item)             // -> string
}
```



`fetchLibrary` 的 `items` 形状：

```js
{ id: 'emby-item-id', name: '显示名', originalTitle: '原名', path: '/media/ABC-123.mp4', year: 2024 }
```

只有 `id` 和 `path` 是必需的；`name` / `originalTitle` 用来提高识别率。

---

## 已知限制

- 只支持 **JavDB + Emby**；Jellyfin/Plex、JavBus/MissAV 是后续计划。
- 番号识别是启发式的；极冷门格式可能漏掉。
- 非管理员 Emby Key 可能读不到 `Path`，识别率会很低。
- 最多同步 5 万部影片；大库会被截断。
- 当前没有自动更新 URL；更新需手动重装 `dist`。
- 本环境无法直连 javdb.com，选择器基于现有开源脚本对真实 DOM 的记录；如果 JavDB 改版，需要更新 `src/sites/javdb.js`。
- 没有在 Safari 上专门测试。
- 仓库元数据里的 GitHub 地址是占位；当前未推送远程仓库。

---

## 类似项目

- [JavdbBuddy / Javdb全能助手](https://github.com/dmdx-cc/JavdbBuddy)：功能更全的 JavDB Tampermonkey 脚本，包含 Emby/Jellyfin 入库徽标、跳转等。
- [JavdbEmbySkin](https://github.com/9E307/JavdbEmbySkin)：JavDB 界面美化 + 本地收藏管理。
- [mdcz](https://github.com/ShotHeadman/mdcz)：服务端 JAV 元数据刮削/整理工具，配合 Emby/Jellyfin/Kodi。

本项目只做「入库检测」，代码量小、零依赖、按适配器扩展，适合想自己改选择器或加网站/服务器的人。

---

## License

[MIT](LICENSE) © 2026 snail1994

本项目与 JavDB、Emby 官方无关联，仅供个人管理自己的媒体库使用。
