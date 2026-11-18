# 中国色

使用 Vue 3 与 Vite 展示 526 种中国传统颜色，保留整页随选色变化的背景、麻布纹理、竖排色名与 CMYK 圆环。

## 开发与构建

建议使用 Node.js 22.12 或更高版本。

```sh
npm ci
npm run dev
node --test tests/*.test.mjs
npm run build
```

构建产物位于 `dist/`，可部署到静态网站托管服务。颜色数据和字体均进入构建产物，运行时不依赖独立 API 服务。

## 功能

- 浏览全部颜色，支持中文名、拼音、HEX、RGB 搜索与色系组合筛选。
- 随机选色、选中状态、键盘操作，以及 `/` 聚焦搜索。
- 桌面密集色卡与右侧详情；手机上方详情与下方横向胶片色卡。
- 复制 HEX、RGB、CMYK 和当前颜色链接；自动复制失败时提供手动复制。
- 唯一颜色分享标识，同时兼容旧的拼音链接。

## 数据与显示

色卡与详情色名统一使用 `api/fonts.woff2` 书法字体。已补入乌、桲、榲、樫、沬、筍、芓、鈫、鷃共 9 个按现有风格生成的字形，覆盖全部 526 个色名中的 490 个汉字。合并保留原有字形、字宽与字体元数据；新增字形使用矢量轮廓，随构建一起发布。

`ColorName.vue` 将每个字放入等大字格，按真实笔画边界居中并等比收敛偏大的字，保留自然宽高比例。详情预留五字高度，固定中文中心轴与拼音起始位置；桌面详情/色卡字号为 56/18px，手机为 42/16px。更换字体或增补色名后，安装 Python 开发工具 `fonttools[woff]` 并运行 `python3 scripts/measure-color-font.py`，更新 `src/color-name-metrics.json`。正常构建与部署不需要 Python。

保留 `api/colors.json` 的全部原始记录。页面以原始 HEX 为依据计算展示用 RGB，保证色卡、背景与详情一致。重复拼音的颜色使用 `拼音-hex` 标识，旧的重复拼音链接仍定位首条记录。文字根据背景亮度选择黑色或白色。

CMYK 保留原始数据，不表示经过 ICC 配置认证；屏幕颜色与实际印刷可能存在差异。色系按屏幕 RGB 色值分类。

## 验证

自动检查覆盖颜色数据、分享标识、文字对比度、搜索筛选、复制成功与失败处理，以及版本递增、发布重试、并发冲突和归档校验。生产构建通过。自动检查不代替浏览器布局及真实剪贴板权限的端到端验证。

## GitHub 自动构建与 Release

工作流位于 `.github/workflows/github_deploy.yml`，名称为 `github_deploy`。推送代码到 `master` 后自动执行依赖安装、测试、生产构建和 Release 发布，使用仓库自带的 `GITHUB_TOKEN`，无需配置个人访问令牌。

| 操作 | 版本规则 |
| --- | --- |
| 首次推送 `master`，尚无版本标签 | 从当前 `0.0.0` 基线发布 `v0.0.1` |
| 后续推送 `master` | 找到数值最大的稳定版本标签，patch 加 1，例如 `v1.0.3` → `v1.0.4` |
| 推送 `v2.0.0` 标签 | 按 `v2.0.0` 发布，之后普通提交发布 `v2.0.1` |
| 推送 `v1.1.0` 标签 | 按指定次版本发布 |
| 重跑失败的任务 | 复用同一提交已有的版本标签，补完草稿与缺失附件 |

“大版本”或“次版本”由手动标签明确指定，标签必须严格使用 `v主版本.次版本.补丁版本` 格式，不接受预发布后缀或前导零。标签目标必须属于 `master` 历史；支持普通标签和带说明的 annotated tag。

```sh
git switch master
git pull --ff-only
git tag -a v1.0.0 -m "Release v1.0.0"
git push origin v1.0.0
```

测试和构建成功后才创建自动版本标签；不会向 `master` 回写版本提交。不同提交可以并行构建，版本按成功占号的顺序分配；同版本冲突会重新计算，不会强推或覆盖标签。已完成发布的同提交重跑不新增版本。若自动发布后再给该提交打新的手动版本标签，则按新标签额外发布一次。

每个版本 Release 包含：

- `zhongguose-vX.Y.Z.zip`
- `zhongguose-vX.Y.Z.tar.gz`
- `SHA256SUMS.txt`

两个归档均直接包含可部署的静态网站文件，使用相对资源路径，适合部署到域名根路径或子目录。包内 `release.json` 记录版本与源提交；校验和可用 `sha256sum -c SHA256SUMS.txt` 验证。附件上传完整后才公开 Release；较早提交的并发构建不会替换当前 `master` 的 latest 发布。

工作流也可在 Actions 页面手动运行（选择 `master`）。如仓库或组织规则禁止自动创建标签/Release，需要允许该工作流的 `contents: write` 权限。


## 服务器固定下载入口

每次版本发布成功后，独立的 `latest` 任务会读取当前已发布的稳定版本，验证原包校验和，再更新名为 `latest` 的滚动 Release。历史版本保留；`latest` 不参与版本递增计数。

现有服务器拉取脚本使用以下变量：

```sh
BASE_URL="https://github.com/2d78de1c/zhongguose/releases/download/latest"
ZIP_FILE="dist-vlatest.zip"
SHA_FILE="$ZIP_FILE.sha256"
EXTRACT_DIR="/data/app/zhongguose/"
```

固定附件为 `dist-vlatest.zip` 和 `dist-vlatest.zip.sha256`。ZIP 布局为：

```text
dist/
  index.html
  assets/
  release.json
```

校验文件采用标准格式：`<SHA256>  dist-vlatest.zip`。包内 `dist/release.json` 保留实际版本和提交，因此服务器原有的 `dist/index.html` 检查及解压到 `$EXTRACT_DIR` 的方式可直接使用。

`latest` 更新任务串行执行，并读取当前稳定版本，避免旧任务覆盖新版本；相同文件会跳过上传。仅滚动标签 `latest` 会移动，稳定版本标签不改动。该滚动 Release 设置 `make_latest: false`，因此 GitHub 的“Latest”标记仍指向实际的稳定版本。

服务器 ZIP 的文件修改时间使用对应稳定版本的发布时间，并写入 UTC 时间戳，避免不同版本的 `index.html` 恰好同大小、同时间，导致 Nginx 等服务器误用旧的缓存验证标识。相同版本的发布时间不变，重打包仍能生成一致的 ZIP 和校验和。

GitHub 不支持两个附件同时原子替换。工作流先替换 ZIP、最后更新 SHA256；切换时若下载失败或校验不一致，服务器应停止替换现有目录并重新下载两个文件后重试。不要在校验通过前删除正在运行的 `dist/`。

### 服务器更新脚本

使用仓库中的 `scripts/pull-latest.py` 替换旧的下载脚本，需要 Linux、Python 3 和 curl。默认使用当前仓库 `2d78de1c/zhongguose` 的固定 `latest` 入口，部署到 `/data/app/zhongguose/dist`：

```sh
# 将下载好的 pull-latest.py 放在服务器脚本目录，再执行。
python3 pull-latest.py

# 若需要 SOCKS5 代理，显式传入原来的代理值；留空时直接连接。
PROXY="127.0.0.1:1080" EXTRACT_DIR="/data/app/zhongguose" python3 pull-latest.py
```

如果原来的 `PROXY` 只是 shell 局部变量，使用 `PROXY="$PROXY" python3 pull-latest.py` 将它传入进程。`BASE_URL`、`EXTRACT_DIR`、`CACHE_DIR` 可通过环境变量覆盖；缓存默认在部署根目录的 `.download-cache`，不依赖 cron 的当前目录。

脚本对下载使用 HTTP 错误检查、重试、禁止缓存请求头与唯一查询参数；在 `latest` 的 ZIP/SHA 短暂不一致时，最多重新获取三组。缓存 ZIP 校验成功后仍会检查 **实际部署文件的清单和内容**，因此缓存已新而目录仍旧、静态资源缺失或损坏都能修复。

新包先在同一文件系统的临时目录完成完整性检查和解压，再将旧 `dist` 改名为 `.dist-previous` 并切换新目录。目录切换失败会恢复旧版；若进程被中断导致 `dist` 缺失，下次启动先恢复备份。普通目录的两次改名之间有很短的切换窗口，不是严格的原子切换。历次备份保留为 `.dist-backup-*`，按服务器磁盘容量自行清理。脚本不会自动改动符号链接形式的部署目录。

更新进程通过文件锁避免重叠执行；下载、校验、解压失败会保留已部署版本并以非零状态退出。远程包比已部署版本旧时默认拒绝降级；明确回退历史版本时才设置 `ALLOW_DOWNGRADE=1`。成功日志打印版本、提交、SHA256 和实际部署路径。

服务器仍显示旧版时，先核对磁盘上的版本：

```sh
cat /data/app/zhongguose/dist/release.json
```

若磁盘已是新版而网页仍旧，检查 Web 服务实际根目录、Docker 挂载目录和 CDN/浏览器缓存。Nginx 的 `index.html`、`release.json` 应重新验证缓存，例如 `Cache-Control: no-cache`；带内容哈希的 `assets/` 可长期缓存。这些服务配置需要结合服务器现状设置，脚本不修改 Nginx 或 CDN。
