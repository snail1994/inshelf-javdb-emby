# Inshelf · JavDB / 123AV Emby 入库检测

在 [JavDB](https://javdb.com) 和 [123AV](https://123av.com) 的列表页、详情页直接显示：这部影片**是否已经收入你的 Emby 媒体库**。已入库的绿色徽标可以点击，直接打开 Emby 里对应的影片。

这是一个 Tampermonkey（篡改猴）用户脚本。它只读取你的 Emby 媒体库，不会修改、删除、下载或播放任何东西。

> 当前版本：`0.2.0`。支持 **JavDB / 123AV + Emby**，个人自用。

---

## 效果

| 页面         | 显示                     |
| ---------- | ---------------------- |
| JavDB 列表页  | 每张影片卡片标题旁出现一个小徽标       |
| JavDB 详情页  | 影片信息下方出现一行状态 + 跳转链接    |
| 123AV 列表页  | 每张影片卡片标题旁出现一个小徽标       |
| 123AV 详情页  | 影片标题下方出现一行状态 + 跳转链接    |

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

**方式 C：从 GitHub 安装（仓库上传后）**

浏览器打开：

```text
https://raw.githubusercontent.com/snail1994/inshelf-javdb-emby/main/dist/inshelf-javdb-emby.user.js
```

Tampermonkey 会识别 `.user.js` 并弹出安装页。如果 GitHub 用户名或仓库名不是这个，把 URL 换成你自己的。

> 安装脚本**不需要** Node.js。Node 只在修改源码、重新构建时需要。

### 3. 更新

- 从 GitHub 安装：脚本头已配置 `@updateURL`，Tampermonkey 会定期检查 `dist` 的更新。
- 本地安装：重新下载/拖入新的 `dist/inshelf-javdb-emby.user.js`，覆盖旧版本。
- 如果 GitHub 用户名/仓库名不同，先改 `src/userscript-header.txt` 的 `@updateURL` / `@downloadURL`，再重新构建。

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

1. 打开 JavDB（`https://javdb.com`）或 123AV（`https://123av.com`），等页面加载完。
2. 右下角会出现一个圆形齿轮按钮，点它。
3. 填写：
   - **服务器地址**：例如 `http://192.168.1.10:8096`，或 `http://192.168.1.10:8096/emby`。脚本会自动尝试带 `/emby` 和不带 `/emby` 两种。
   - **API Key**：上一步复制的 Key。
   - **缓存时间**：默认 30 分钟。意思是 30 分钟内直接用本地索引，不重复拉库。
4. 点「测试连接」。成功会显示 Emby 的服务器名和版本。
5. 点「保存」。
6. 点「同步媒体库」。第一次会拉取全库，影片多时可能需要几十秒。
7. 回到 JavDB / 123AV 列表/详情页，徽标会出现。

如果齿轮没出现：

- 确认当前网址是 `javdb.com`、`123av.com` 或它们的子域名。
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

### 支持其他网站 / 媒体服务器吗？

当前支持 **JavDB / 123AV + Emby**，不支持其他网站或媒体服务器。

### JavDB / 123AV 改版了，徽标不见了

选择器集中在 `src/sites/javdb.js` 和 `src/sites/av123.js` 顶部。改版后只需要更新对应适配器，重新 `npm run build`。如果你不会改，开 issue 并附上页面截图/HTML 片段。

### 为什么列表页有的卡片没有徽标？

- 标题和链接里没有可识别的番号（例如演员名、合集、无码流出版）。
- 该卡片不是脚本认识的影片卡片结构。
- 123AV 目前通过 `a[href*="/v/"]` 和卡片容器识别，若站点换主题，可能需要补选择器。
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
npm test        # Node 内置测试，26 个用例
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
│   │   ├── javdb.js                 # JavDB 选择器/解析
│   │   └── av123.js                 # 123AV 选择器/解析
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

## 已知限制

- 只支持 **JavDB / 123AV + Emby**。
- 番号识别是启发式的；极冷门格式可能漏掉。
- 非管理员 Emby Key 可能读不到 `Path`，识别率会很低。
- 最多同步 5 万部影片；大库会被截断。
- 从 GitHub 安装时由 Tampermonkey 按 `@updateURL` 检查更新；本地安装仍需手动重装 `dist`。
- 开发环境通过本地代理抓取 JavDB；选择器基于真实页面 DOM，如果 JavDB 改版，需要更新 `src/sites/javdb.js`。
- 没有在 Safari 上专门测试。

---

## 类似项目

- [JavdbBuddy / Javdb全能助手](https://github.com/dmdx-cc/JavdbBuddy)：功能更全的 JavDB Tampermonkey 脚本，包含 Emby/Jellyfin 入库徽标、跳转等。
- [JavdbEmbySkin](https://github.com/9E307/JavdbEmbySkin)：JavDB 界面美化 + 本地收藏管理。
- [mdcz](https://github.com/ShotHeadman/mdcz)：服务端 JAV 元数据刮削/整理工具，配合 Emby/Jellyfin/Kodi。

本项目只做「入库检测」，代码量小、零依赖。

---

## License

[MIT](LICENSE) © 2026 snail1994

本项目与 JavDB、Emby 官方无关联，仅供个人管理自己的媒体库使用。
