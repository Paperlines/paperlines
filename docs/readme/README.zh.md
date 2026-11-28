<div align="center">

<img src="../../src/assets/logo-128.png" alt="Paperlines 标志" width="112" height="112" />

<h1>Paperlines<br />&#8203;<sup><sub><em>Nanos gigantum humeris insidentes</em></sub></sup></h1>

**你的论文、你的笔记，以及它们之间的引用关系，尽在一个本地应用中。**

一款免费、开源的文献管理器，支持 macOS、Windows 和 Linux：你的论文、你的笔记，以及一张展示它们如何相互引用的实时图谱，都在你自己电脑上的同一个应用里。

<!-- the release workflow points these buttons at each new version -->
<a href="https://github.com/Paperlines/paperlines/releases/download/v0.1.4/Paperlines_0.1.4_aarch64.dmg"><img src="../assets/readme/download-macos.svg" alt="下载 macOS 版（Apple Silicon）" height="52" /></a> <a href="https://github.com/Paperlines/paperlines/releases/download/v0.1.4/Paperlines_0.1.4_x64-setup.exe"><img src="../assets/readme/download-windows.svg" alt="下载 Windows 版" height="52" /></a> <a href="https://github.com/Paperlines/paperlines/releases/download/v0.1.4/Paperlines_0.1.4_amd64.AppImage"><img src="../assets/readme/download-linux.svg" alt="下载 Linux 版（AppImage）" height="52" /></a>

[![最新版本](https://img.shields.io/github/v/release/Paperlines/paperlines?color=0e7490)](https://github.com/Paperlines/paperlines/releases/latest) [![下载量](https://img.shields.io/github/downloads/Paperlines/paperlines/total?color=0e7490)](https://github.com/Paperlines/paperlines/releases) [![CI](https://github.com/Paperlines/paperlines/actions/workflows/ci.yml/badge.svg)](https://github.com/Paperlines/paperlines/actions/workflows/ci.yml) [![许可证：AGPL v3+](https://img.shields.io/badge/licence-AGPL--3.0--or--later-0e7490)](../../LICENSE) [![最近提交](https://img.shields.io/github/last-commit/Paperlines/paperlines?color=0e7490)](https://github.com/Paperlines/paperlines/commits/main) [![Stars](https://img.shields.io/github/stars/Paperlines/paperlines?style=social)](https://github.com/Paperlines/paperlines/stargazers)

[**下载**](#download) · [功能](#why-paperlines) · [命令行与 MCP](#command-line-and-ai-assistants) · [常见问题](#questions-people-ask) · [参与贡献](../../.github/CONTRIBUTING.md)

免费 · 开源 · 无需账号 · 无云端 · 无遥测

[English](../../README.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · **简体中文** · [日本語](README.ja.md) · [हिन्दी](README.hi.md)

</div>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../assets/readme/hero-dark.png" />
    <img src="../assets/readme/hero-light.png" alt="Paperlines：文献库、带公式和链接的论文笔记，以及并排显示的 PDF 阅读器" width="100%" />
  </picture>
</p>

<a id="why-paperlines"></a>

## 为什么选择 Paperlines

科研阅读同时发生在三个地方：文献管理器、笔记应用和一堆 PDF。Paperlines 把它们放进同一个窗口，就在你自己的电脑上。

- **收集。** 拖入 PDF、EPUB 或整个文件夹，粘贴 DOI、arXiv 或 PubMed ID，或者导入 BibTeX、RIS、CSL-JSON 或你的 Zotero 文献库。元数据会从 Crossref 和 OpenAlex 补全，保存前你可以逐一确认。
- **阅读与批注。** 快速的 PDF 阅读器，支持有含义的彩色高亮（核心观点、方法、不同意……）、下划线和区域选择。“引用到笔记”会把高亮放进笔记，并附上回到原页的链接。
- **写相互链接的笔记。** 每篇论文都有一篇笔记，另有自由笔记和项目笔记。使用 Markdown，支持 `[[links]]`、`@citekey` 引用、反向链接、表格和 LaTeX 公式，边输入边渲染。
- **看清论文之间的联系。** 参考文献列表只获取一次并缓存；引用图谱显示*你的*论文之间谁引用了谁，添加新论文时可离线更新。
- **随处引用。** 约 80 种引用样式，为 LaTeX 自动保持最新的 BibTeX 文件，以及各种导出，包括把整个文献库导出为一个文件夹。
- **属于你。** 一个 SQLite 文件加上你的 PDF，存放在你选择的文件夹中。每日备份，一键恢复。除了你主动发起的查询，没有任何数据离开你的电脑。

## 帮你思考的引用图谱

<p align="center">
  <img src="../assets/readme/graph.png" alt="树形布局的引用图谱，项目的关键论文按编号步骤排列" width="100%" />
</p>

- 论文在实时力导向布局中浮动，拖动一篇，相邻论文随之移动；悬停时高亮它引用的论文（蓝色）和引用它的论文（橙色）。
- 以项目颜色填充，以阅读状态作为边框。可按年份、标签、项目、状态筛选，也可查看某篇论文周围的局部图谱。
- **关键论文（主线）：** 逐步标记项目所依托的论文。**树形**布局从它们出发生长出整个领域；**环形**布局按项目和年份对所有论文分组。
- **类型化关联**，依你自己的判断：一篇论文*扩展*、*反驳*、*复现*了另一篇，或*应用了*另一篇*的方法*，并可附上备注和一处高亮作为证据。

## 发现接下来读什么

<p align="center">
  <img src="../assets/readme/citing.png" alt="一篇论文的引用及引用它的论文，按被引次数排序" width="100%" />
</p>

- **引用本文的论文：** 对任意一篇论文，从整个 OpenAlex 中找出引用它的被引最多的 2,000 篇论文。按**关联最多**排序，可以看到同时引用你文献库中其他论文的那些，它们通常最值得接下来阅读。
- **在线搜索**：同时检索 OpenAlex、Semantic Scholar、arXiv、PubMed、Crossref、Europe PMC、DataCite 和 DOAJ，合并成一个列表，并标出你已有的论文。全部免费。
- 自动发现并合并重复项，不会丢失任何笔记或高亮。

## 从浏览器保存论文

<p align="center">
  <a href="https://chromewebstore.google.com/detail/paperlines/ooldfogehieegmochobljichkajignkf"><img src="../assets/readme/extension.png" alt="Paperlines 扩展在论文页面上，准备保存论文及其 PDF" width="100%" /></a>
</p>

- **在论文页面一键保存：**在期刊页面、arXiv、PubMed 或 DOI 链接上，Paperlines 按钮会显示找到的论文（标题、作者、年份、期刊、标识符），并连同 PDF 一起保存。
- **了解你的文献库：**论文已在库中时会提示你；已有但缺少 PDF 的论文会补上 PDF，而不会重复添加。
- **支持你的订阅：**PDF 使用你自己的浏览器登录状态下载。
- **注重隐私：**只在你点击时读取页面，并把结果交给你电脑上的 Paperlines，从不发送到服务器。即使应用未打开也能使用。
- **支持** Google Chrome、Microsoft Edge、Brave、Arc、Vivaldi 和 Chromium。

**👉 [将 Paperlines 添加到浏览器](https://chromewebstore.google.com/detail/paperlines/ooldfogehieegmochobljichkajignkf)**，然后在应用的 **设置 → 浏览器扩展** 中点击 **连接**。

## 使用你自己的 AI 助手

<p align="center">
  <img src="../assets/readme/assistants.png" alt="设置 → AI 助手，以及三个 Paperlines 技能" width="80%" />
</p>

- **助手面板（⌘J）：** 与你自己的 Claude Code 或 Codex 讨论当前打开的论文、PDF 或笔记。在你允许编辑之前它是只读的，它做出的每一处修改都会显示出来。
- **一键连接** Claude Code、Claude Desktop、Codex、Antigravity、Gemini CLI、Grok 和 Cursor，通过内置的 MCP 服务器，并附带三个技能：处理你的论文、撰写结构化的论文笔记（每个要点都关联到 PDF 中的高亮），以及查找你遗漏的论文。
- 推荐会进入项目的**推荐论文**收件箱。未经你点击，任何内容都不会进入你的文献库。

<a id="download"></a>

## 下载

<!-- the release workflow updates these links to each new version -->
| 平台 | 安装程序 | 其他格式 |
| --- | --- | --- |
| **macOS**，Apple Silicon（M1 及更新） | [Paperlines_0.1.4_aarch64.dmg](https://github.com/Paperlines/paperlines/releases/download/v0.1.4/Paperlines_0.1.4_aarch64.dmg) | [.pkg](https://github.com/Paperlines/paperlines/releases/download/v0.1.4/Paperlines_0.1.4_aarch64.pkg) |
| **macOS**，Intel | [Paperlines_0.1.4_x64.dmg](https://github.com/Paperlines/paperlines/releases/download/v0.1.4/Paperlines_0.1.4_x64.dmg) | [.pkg](https://github.com/Paperlines/paperlines/releases/download/v0.1.4/Paperlines_0.1.4_x64.pkg) |
| **Windows** 10/11，x64 | [Paperlines_0.1.4_x64-setup.exe](https://github.com/Paperlines/paperlines/releases/download/v0.1.4/Paperlines_0.1.4_x64-setup.exe)（无需管理员权限） | [.msi](https://github.com/Paperlines/paperlines/releases/download/v0.1.4/Paperlines_0.1.4_x64_en-US.msi) |
| **Linux**，x86_64 | [Paperlines_0.1.4_amd64.AppImage](https://github.com/Paperlines/paperlines/releases/download/v0.1.4/Paperlines_0.1.4_amd64.AppImage) | [.deb](https://github.com/Paperlines/paperlines/releases/download/v0.1.4/Paperlines_0.1.4_amd64.deb) · [.rpm](https://github.com/Paperlines/paperlines/releases/download/v0.1.4/Paperlines-0.1.4-1.x86_64.rpm) · [CLI](https://github.com/Paperlines/paperlines/releases/download/v0.1.4/paperlines-x86_64-unknown-linux-gnu) |
| **Linux**，aarch64 | [Paperlines_0.1.4_aarch64.AppImage](https://github.com/Paperlines/paperlines/releases/download/v0.1.4/Paperlines_0.1.4_aarch64.AppImage) | [.deb](https://github.com/Paperlines/paperlines/releases/download/v0.1.4/Paperlines_0.1.4_arm64.deb) · [.rpm](https://github.com/Paperlines/paperlines/releases/download/v0.1.4/Paperlines-0.1.4-1.aarch64.rpm) · [CLI](https://github.com/Paperlines/paperlines/releases/download/v0.1.4/paperlines-aarch64-unknown-linux-gnu) |
| **NixOS** | `nix profile install github:Paperlines/paperlines` | 见下方说明 |

所有文件都在 [Releases 页面](https://github.com/Paperlines/paperlines/releases/latest)。Linux 安装包需要 glibc 2.35 或更新版本（Ubuntu 22.04、Debian 12、Fedora 36 及更新版本）。

**浏览器扩展（Chrome、Edge、Brave、Arc、Vivaldi）：**一键保存正在阅读的论文及其 PDF。[从 Chrome 网上应用店添加](https://chromewebstore.google.com/detail/paperlines/ooldfogehieegmochobljichkajignkf)，然后在应用的 **设置 → 浏览器扩展** 中点击 **连接**。没有应用店的浏览器也可以使用 [.zip](https://github.com/Paperlines/paperlines/releases/latest/download/paperlines-browser-extension.zip)。

### 在应用内更新

<p align="center">
  <img src="../assets/readme/update.png" alt="更新对话框：新功能、贡献者、立即更新或稍后" width="420" />
</p>

有新版本发布时，Paperlines 会在下次打开时告诉你：有哪些新功能、谁参与了开发，以及**立即更新**或**稍后**。更新经过签名，并在安装前进行校验。macOS 应用、Windows 安装程序和 AppImage 可以自行更新；`.deb`、`.rpm` 和 Nix 安装则通过各自的包管理器更新。可在“设置 → 通用”中关闭检查；离线模式下从不检查。

<details>
<summary>平台说明：macOS 安装程序、Linux、NixOS、COSMIC/Wayland</summary>

**macOS 安装程序。** 打开 `.pkg` 并按步骤操作。它会将 Paperlines 安装到“应用程序”文件夹，并将 `paperlines` 命令安装到 `/usr/local/bin`。卸载时，删除应用和 `/usr/local/bin/paperlines` 即可；你的文献库保持原位。

**在 macOS 上首次打开。** macOS 版本尚未经过 Apple 签名，因此 macOS 会提示“无法验证”Paperlines。点击**完成**，打开**系统设置 → 隐私与安全性**，向下滚动，点击 Paperlines 旁的**仍要打开**并确认。只需操作一次。

**在 Windows 上首次打开。** 如果 Windows 显示“Windows 已保护你的电脑”，请点击**更多信息 → 仍要运行**。已签名的 Windows 版本即将推出（[代码签名政策](../code-signing.md)）。

**Linux。** `.deb` 和 `.rpm` 安装包会将 CLI 安装为 `paperlines`。对于 AppImage，请将单独的 `paperlines-<triple>` 文件放到 PATH 中，或使用**设置 → 命令行 → 安装命令行工具**。

**NixOS。** 本仓库是一个 flake，可从源码构建应用和 CLI（x86_64 和 aarch64）：

```sh
nix run github:Paperlines/paperlines            # try it
nix profile install github:Paperlines/paperlines
```

在 NixOS 或 home-manager 配置中，将该 flake 添加为输入，并使用其 overlay：

```nix
nixpkgs.overlays = [ inputs.paperlines.overlays.default ];
environment.systemPackages = [ pkgs.paperlines ];   # or home.packages
```

这会安装应用及其桌面条目和图标，以及 `paperlines` 命令。注意：
- API 密钥保存在 Secret Service 中。请启用一个（`services.gnome.gnome-keyring.enable = true;` 或 KeePassXC）；没有的话，密钥会改为保存在一个加密文件中。
- AppImage 无法直接在 NixOS 上运行；请使用 flake（或 `appimage-run`）。

**COSMIC（及其他 Wayland 桌面）。** 为 COSMIC 构建，但尚未在其上测试，欢迎反馈：
- 浅色/深色跟随桌面设置（从 COSMIC、GNOME 和 KDE 都使用的 XDG 桌面门户读取），包括应用打开期间的切换。设置中的**跟随系统**主题即指此功能。
- 窗口有正确的应用 ID，因此程序坞会显示正确的图标，并将窗口与其启动器归为一组。
- 在 Wayland 下使用 NVIDIA 驱动时，WebKitGTK 的 DMA-BUF 渲染器会被自动关闭（否则会显示空白窗口）。设置 `WEBKIT_DISABLE_DMABUF_RENDERER=0` 可保持开启。
- 文件对话框使用 GTK。窗口没有系统标题栏或菜单栏：Paperlines 自己的顶栏提供窗口按钮，拖动顶栏即可移动窗口。

</details>

<a id="command-line-and-ai-assistants"></a>

## 命令行与 AI 助手

`paperlines` 命令与应用操作同一个文献库。macOS 的 `.pkg` 会安装它；其他平台请使用**设置 → 命令行 → 安装命令行工具**。

<details>
<summary>命令</summary>

macOS 的 `.pkg` 会为你安装它。否则请使用**设置 → 命令行 → 安装命令行工具**。在 macOS 上，它会将应用内附带的 CLI 链接到 `~/.local/bin/paperlines`。然后：

```sh
paperlines search 'tag:ml year:>=2020 attention'
paperlines show vaswani2017attention          # metadata, counts and the paper note
paperlines note devlin2019bert --add 'Masked LM pre-training'
paperlines cites devlin2019bert               # library papers it cites (also: cited-by)
paperlines add paper.pdf 10.1038/nature14539 refs.bib --fetch-refs
paperlines export -f bibtex --project Thesis -o thesis.bib
paperlines export-notes ~/notes-export
paperlines fetch-refs                         # every paper without a reference list
paperlines doctor [--fix]                     # integrity, files, edges, search index
paperlines backup [--list | --restore FILE --yes]
paperlines cite vaswani2017attention --style ieee   # -b for a reference list; `paperlines styles` lists styles
paperlines rm KEY... / paperlines trash [list | restore KEY... | empty [--older-than DAYS]]
paperlines citing vaswani2017attention -s connected   # papers anywhere citing it (also: cited, newest)
paperlines relate chen2022 extends smith2021 --note "same loss"   # also: unrelate, relations [KEY], relation-types
paperlines duplicates [--merge | --dismiss]
paperlines find-pdf [KEY...]                  # open-access PDFs via OpenAlex
paperlines import-zotero [~/Zotero] / paperlines import-dump library.json
paperlines auto-export add -f bibtex thesis.bib [--project Thesis]
paperlines paths [--set-library DIR]
```

每个命令都支持 `--json`。`--library DIR` 或 `PAPERLINES_LIBRARY=DIR` 可选择另一个文献库。CLI、应用和 MCP 服务器共用同一套实现（`crates/ops`），因此结果完全一致。

</details>

<details>
<summary>用于 Claude Code、Claude Desktop 等的 MCP 服务器</summary>

```sh
claude mcp add paperlines -- paperlines mcp
```

Claude Desktop：将以下内容添加到 `claude_desktop_config.json`：

```json
{ "mcpServers": { "paperlines": { "command": "paperlines", "args": ["mcp"] } } }
```

工具：`search_library`、`get_item`、`get_paper_note`、`list_citations`、`find_citing_papers`、`list_relations`、`export_bibliography`（均为只读；`find_citing_papers` 在没有缓存结果时会访问网络）、`add_bullet`（向论文笔记追加一个要点）和 `add_relation`（记录用户要求的类型化关联）。服务器只通过 stdin 和 stdout 通信。

</details>

<a id="questions-people-ask"></a>

## 常见问题

<details>
<summary>需要账号吗？有数据上传到云端吗？</summary>

无需账号，没有云端，没有遥测。文献库就是你电脑上的一个文件夹。唯一的网络请求是：在你添加论文或主动请求时进行的元数据、参考文献和施引论文查询（Crossref、OpenAlex、Semantic Scholar、arXiv），只发送 DOI 等标识符；以及应用打开时向 GitHub 发送的一个请求，用于查看是否有新版本。**设置 → 离线模式**可将这些全部关闭。

</details>

<details>
<summary>可以从 Zotero 迁移过来吗？</summary>

可以。**添加 → 从 Zotero 导入**会导入论文及其 PDF、分类（作为项目）、标签、笔记和高亮。Zotero 的数据库会先被复制，绝不修改原文件，因此你可以两者同时使用。

</details>

<details>
<summary>我的数据在哪里？如何备份？</summary>

| | macOS | Linux |
| --- | --- | --- |
| 文献库（数据库、`pdfs/`、`backups/`；可在**设置 → 文献库**中移动） | `~/Library/Application Support/Paperlines/` | `$XDG_DATA_HOME/paperlines/`（默认 `~/.local/share/paperlines/`） |
| 配置（API 密钥后备存储） | `~/Library/Application Support/Paperlines/` | `$XDG_CONFIG_HOME/paperlines/` |
| 缓存 | `~/Library/Caches/Paperlines/` | `$XDG_CACHE_HOME/paperlines/` |

- **文献库**是一个 SQLite 文件（WAL、FTS5），加上按内容哈希存储的 PDF。原始文件会被复制进来，绝不修改。
- **云同步文件夹。** 如果你把文献库放在 iCloud Drive 或 Dropbox 中，请在同步前退出应用。云客户端不能同步正在打开的 SQLite 数据库。
- **API 密钥。** 密钥（Semantic Scholar 和 OpenAlex，均为可选）保存在 macOS 钥匙串或 Linux Secret Service 中。没有 Secret Service 时，会保存到配置文件夹中的一个加密文件里。

每天以及每次升级前都会自动备份；在**设置 → 文献库**中一键即可恢复，`paperlines backup` 可在终端中完成同样的操作。

</details>

<details>
<summary>能配合 LaTeX 使用吗？</summary>

可以。以约 80 种样式复制引用，导出 BibTeX、CSL-JSON 或 RIS，并使用**保持此文件更新**，在文献库每次变化时重写 `.bib` 文件，类似 Better BibTeX。

</details>

<details>
<summary>Paperlines 的全部功能</summary>

- **文献库。** 通过拖入 PDF、EPUB 或文件夹添加论文，或通过 DOI、arXiv ID，以及 BibTeX、RIS 或 CSL-JSON 文件添加。每个文件按标题和作者列出，而不是文件名。元数据来自文件本身（PDF 信息、EPUB 包数据），并通过 Crossref 或 OpenAlex 补全。没有 DOI 的 PDF 会根据首页文字进行匹配。保存前你可以确认所有内容。文献库是一个可排序的表格（标题、创建者、年份、添加日期），所有文献字段均可编辑：卷、期、页码、出版社、出版地、ISBN/ISSN、版次、丛书和编者。
- **从 Zotero 导入。** 导入论文及其 PDF、分类（作为项目）、标签、笔记和高亮。Zotero 的数据库会先被复制，绝不修改。本应用导出的 JSON 也可以导入。
- **重复项与回收站。** “重复项”视图会找出具有相同 PDF，或同一年份标题几乎相同的论文。可将它们合并为一篇，保留所有笔记、高亮、标签和文件。删除会将论文移到回收站（可撤销）；回收站会在 30 天后自动清空（可配置）。
- **搜索。** 全文搜索涵盖标题、作者、摘要、笔记和高亮，并支持限定符：`tag:ml/nlp project:"Thesis" author:hinton year:>=2020 is:unread has:pdf cites:<citekey> cited-by:<citekey>`，`-` 用于排除某个词。搜索可以保存。
- **整理。** 彩色的层级标签（可重命名和合并）、项目、阅读状态、评分，以及命令面板（⌘K / Ctrl+K）。
- **阅读。** 基于 PDF.js 的阅读器，支持高亮、下划线和区域选择。高亮颜色带有含义（黄色 = 核心观点，等等）。“引用到笔记”会把高亮复制到论文笔记中，并附上回到原页的链接。“导出带批注的 PDF”会写出一份副本；原文件绝不修改。
- **快速添加。** 在顶栏的输入框中粘贴 DOI、arXiv 或 PubMed ID，或者标题，按 Enter 确认并添加；输入框末端的按钮提供其他添加方式（文件、文件夹、BibTeX、Zotero、导出的文献库、在线搜索）。
- **论文笔记。** 每篇论文都有一篇笔记。笔记头部（标题、作者、日期）根据论文自动生成；正文是你的要点。笔记使用 Markdown，支持指向其他笔记和论文的 `[[links]]`（输入 `[[` 会给出建议，没有匹配时会提供新建笔记，打开链接即创建该笔记）、`@citekey`、公式和反向链接。公式使用 LaTeX：`$…$` 为行内公式，`$$…$$` 为居中公式（可跨多行），由 KaTeX 渲染。在公式中输入 `\` 会补全命令并显示对应符号（`\al` → `\alpha` α）。编辑器工具栏提供标题和小标题、粗体、斜体、删除线和代码、无序列表、有序列表、任务列表和引用块（快捷键：⌘B、⌘I、⌘E、⌘⇧X、⌘⇧8/7/9、⌘⌥1–3；每个按钮都可切换，Enter 会延续列表），还有链接按钮、行内公式和公式块按钮，以及一个 **Ω** 符号面板，包含希腊字母、运算符、关系符、箭头、集合与逻辑符号以及重音符号。实时预览：Markdown 和公式边输入边渲染，只有正在编辑的地方除外。自由笔记和项目笔记的用法相同。
- **在线搜索。** 一次搜索 OpenAlex、Semantic Scholar、arXiv、PubMed、Crossref、Europe PMC（生命科学，提供免费全文）、DataCite（数据集、软件和预印本）和 DOAJ（开放获取期刊），合并为一个排好序的列表；可开关各个来源，查看哪些论文你已拥有，并将结果绘制成项目图谱。全部免费；只有 OpenAlex 和 Semantic Scholar 可选择填写密钥。
- **引用图谱。** 参考文献列表只获取一次（先用 OpenAlex，再用 Semantic Scholar，或你自己的 GROBID 服务器）并缓存；开放引文索引 OpenCitations 会补充它们遗漏的参考文献，并在两者都不认识某篇论文时作为替补。只有文献库中的论文才会出现在图谱中。之后添加的论文会根据缓存离线建立链接。你可以手动添加或移除链接，重新计算时会保留这些决定。
- **图谱视图。** 论文显示为圆角方框，标注第一作者和年份（“Smith ’21”），也可以显示为圆点。实时力导向布局：论文浮动后逐渐稳定，拖动一篇会带动其相邻论文，标签随缩放淡入，悬停时会高亮论文的引用关系（蓝色：它引用的；橙色：引用它的）并淡化其余部分。论文以项目颜色填充，以阅读状态作为边框；选中和键盘焦点会在方框周围绘制轮廓，画布上的小图例会说明各颜色的含义。齿轮按钮会在图谱旁停靠图谱设置面板（面板较窄时会先将其加宽）：**筛选**（搜索、无链接的论文、年份、标签、项目、状态、所选论文周围的局部图谱）、**分组**（按项目、标签或状态着色；状态环；图例）、**显示**（方框或圆点、力导向或按年份布局、标签文字、箭头、文字淡出、节点大小、连线粗细、概览图）和**力**（向心力、排斥力、连线力、连线距离）。悬停在论文上会显示其笔记卡片；点击可固定并编辑；双击或按 Enter 打开 PDF。
- **类型化关联。** 依你的判断记录论文之间的关系：一篇*扩展*、*反驳*、*复现*了另一篇，或*应用了*另一篇*的方法*，也可以是你自定义的类型（例如*支持* / *被支持*）。每个关联从两篇论文的角度都能正确表述（“扩展” / “被扩展”），可附带备注和一处 PDF 高亮作为证据，并在图谱中显示为带标签的彩色连线，可按类型筛选。可以在论文的“引用”标签页、右键菜单、⌘K 中添加，也可以在图谱中按住 ⌥ 从一篇论文拖到另一篇。也可使用 `paperlines relate chen2022 extends smith2021` 以及 MCP 工具 `list_relations` / `add_relation`。
- **引用本文的论文。** 对任意有 DOI 或 arXiv ID 的论文，从整个 OpenAlex（以 Semantic Scholar 作为后备）查看谁引用了它：被引最多的 2,000 篇，可按被引次数、日期或**关联最多**排序；“关联最多”指同时引用你文献库中其他论文的论文，它们通常最值得接下来阅读。可以筛选，标出哪些已在你的文献库中，并通过导入确认添加你想要的论文。结果缓存一周；`paperlines citing` 和 MCP 服务器也能做到同样的事。
- **关键论文（主线）。** 逐步标记项目所依托的论文：先是最初的想法，然后是在其基础上的发展。一个步骤可以包含多篇论文（例如两个团队同时得出了相同的发现）。可在项目对话框中构建，或右键点击论文 → *加入主线*。图谱将关键论文绘制为按步骤编号（①、②……）的琥珀色方框，由一条金色路径连接。另有两种布局使用它：**树形**从主线开始从左向右生长，每个步骤是主干上一个带名称的方框，其他论文挂在与其最接近的关键论文下；**环形**把所有论文放在一个圆环上，按项目分组、按年份排序（超过 150 篇论文时显示为圆点）。也可使用 `paperlines spine "Thesis" add smith2018 --step 1`。
- **助手面板。** ⌘J（或助手按钮）会打开与你自己的 **Claude Code** 或 **Codex** 的对话，使用你自己的账号登录，因此无需设置 API 密钥。面板会列出你在“设置 ▸ AI 助手”中连接的智能体；可在面板顶部切换（切换后会开始新对话）。它只能看到你的 Paperlines 文献库，使用的工具与 MCP 服务器相同。它知道你当前打开的是哪篇论文、PDF 或笔记，并会建议可以问的问题。它的执行步骤折叠为一行，可展开查看；回复中的 `@citekey` 和高亮链接可直接打开对应的论文或页面。在你切换到**可编辑**之前，它处于**只读**状态；切换后，它可以写入笔记、高亮、关联和推荐（从不删除），并且它做出的每一处修改都会显示在对话中。
- **外观。** 设置 ▸ 外观：主题、强调色（青色、蓝色、紫罗兰、绿色、琥珀色、玫瑰色）、布局（侧边栏和助手可放在任一侧：经典、镜像、都在左侧、都在右侧）、细或常规图标，以及可选的顶栏图标下方文字。
- **AI 助手。** “设置 → AI 助手”可一键将内置 MCP 服务器连接到 Claude Code、Claude Desktop、Codex、Antigravity、Gemini CLI、Grok 和 Cursor（它会编辑各助手自己的配置，或使用其自带的 `mcp add` 命令，其他配置保持不变），并安装三个技能：**paperlines**（处理你的论文）、**paperlines-notes**（按你的“核心观点 / 方法 / 为何重要”格式撰写论文笔记，或逐条论点撰写：它会在 PDF 中以代表其含义的颜色高亮每个论点背后的句子，并将笔记中的每个要点关联到对应的高亮；还可撰写项目综述和相关工作草稿；保存前它会展示文本并征求同意，且从不覆盖已有内容）和 **paperlines-scout**（查找你遗漏的论文）。助手能看到你的项目和文献库的主题，能阅读论文的 PDF，通过引用原文来高亮段落（下次打开该 PDF 时，阅读器会将它们放到页面上），还可以创建笔记或向笔记追加内容。每当应用窗口回到前台，应用都会载入助手所做的修改。问它接下来读什么：它会附上理由推荐论文（被你项目中的多篇论文引用、引用了其中多篇、相关，或与某个主题匹配），并将它们放进项目的**推荐论文**收件箱，由你逐一添加或忽略；未经你点击，任何内容都不会进入你的文献库，被忽略的论文也不会再出现。也可使用 `paperlines suggest --project NAME [--topic …] [--post]` 和 `paperlines projects`。
- **标签页与布局。** PDF、笔记和图谱以标签页形式打开。三种布局：仅文献库、文献库加阅读器、仅阅读器。
- **引用。** 以约 80 种内置 CSL 样式（APA、Chicago、IEEE、Nature、Vancouver……）中的任意一种复制引用（⌘⇧C）或参考文献条目（⌘⇧B）。在 Word 或 Google Docs 中粘贴为富文本。**查找开放获取 PDF**会通过 OpenAlex 获取合法副本。
- **导出。** BibTeX、CSL-JSON、RIS、Markdown 参考文献列表、格式化参考文献表（HTML，任意样式），以及一个 Markdown 笔记文件夹。**整个文献库**会写出一个文件夹，包含 `library.json` 和 `pdfs/`，涵盖全部内容：论文及其 PDF、笔记、高亮、标签、项目（含颜色和关键论文）、引用图谱（包括你手动设置的链接），以及类型化关联及其证据。**添加 ▸ 导入文献库…**可将其导入另一个文献库（在另一台电脑上，或合并到已有文献库：已存在的论文会被跳过）。也可使用 `paperlines export-library DIR` 和 `paperlines import-dump FOLDER`。**保持此文件更新**会在文献库每次变化时重写 `.bib`（或其他）文件，类似 Better BibTeX，让 LaTeX 项目始终保持最新。
- **随时可得的帮助。** 设置中以及搜索、回收站和重复项旁边的 ⓘ 按钮会解释每个选项。
- **安全。** 每日备份并可一键恢复，每次数据库结构升级前都会备份，所有操作都使用事务，另有 `doctor` 检查。
- **命令行与 MCP。** `paperlines` CLI，以及一个 MCP 服务器，让 Claude Code 或 Claude Desktop 可以搜索你的文献库并向论文笔记添加要点。它通过 stdio 在本地运行，从不经过网络。

唯一的网络访问是元数据、参考文献和施引论文查询（Crossref、OpenAlex、Semantic Scholar、arXiv），且仅在你添加论文或主动请求时进行；另外，应用打开时会向 GitHub 发送一个请求，查看是否有新版本（可在“设置 → 通用”中关闭）。只会发送标识符（DOI、arXiv ID）。免费的 OpenAlex API 密钥（设置 → 引用）可为你提供独立的每日额度；没有密钥时，查询会与你所在网络共享一个较小的额度。**设置 → 离线模式**可将这些全部关闭。

</details>

## 从源码构建

前置条件：

- Node 26+、pnpm 12.21（确切版本见 `package.json`）、通过 rustup 安装的 Rust（版本固定在 `rust-toolchain.toml` 中）
- **macOS：** Xcode Command Line Tools（`xcode-select --install`）
- **Debian/Ubuntu：** `sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev libsecret-1-dev patchelf build-essential curl file`
- **Fedora：** `sudo dnf install webkit2gtk4.1-devel gtk3-devel libappindicator-gtk3-devel librsvg2-devel libsecret-devel openssl-devel`
- **Arch：** `sudo pacman -S webkit2gtk-4.1 gtk3 libappindicator-gtk3 librsvg libsecret base-devel`

```sh
pnpm install
pnpm tauri dev        # run the app (builds the CLI sidecar first)
pnpm tauri build      # macOS: .app + .dmg; Linux: .deb, .rpm, AppImage
pnpm build:pkg        # macOS: the .pkg installer, from the .app built above
```

如需构建 macOS 通用版本，先运行 `rustup target add x86_64-apple-darwin aarch64-apple-darwin`，然后运行 `pnpm tauri build --target universal-apple-darwin`。

检查、架构和约定见 [docs/development.md](../development.md) 和 [docs/architecture.md](../architecture.md)。

## 了解更多

- [更新日志](../CHANGELOG.md)：每个版本的变更
- [开发](../development.md)：检查、发布、签名、Nix、Windows、重命名
- [架构](../architecture.md)：代码如何组织以及为什么这样组织
- [参与贡献](../../.github/CONTRIBUTING.md)：如何提供帮助

## 社区

欢迎提交错误报告、想法和拉取请求：[提交 issue](https://github.com/Paperlines/paperlines/issues)，或阅读 [CONTRIBUTING.md](../../.github/CONTRIBUTING.md) 开始参与。感谢每一位贡献者：

<a href="https://github.com/Paperlines/paperlines/graphs/contributors"><img src="https://contrib.rocks/image?repo=Paperlines/paperlines" alt="贡献者" /></a>

如果 Paperlines 对你的研究有帮助，在 GitHub 上点一个 ⭐ 可以让更多研究者发现它。

## 引用 Paperlines

<details>
<summary>BibTeX</summary>

```bibtex
@software{paperlines,
  author  = {{The Paperlines contributors} and Yoav Yosif-Or},
  title   = {{Paperlines}: a local-first reference manager},
  year    = {2026},
  url     = {https://github.com/Paperlines/paperlines},
  license = {AGPL-3.0-or-later}
}
```

应用内的**帮助与关于 → 引用 Paperlines**会给出包含你确切版本号的条目，以及 APA 格式。

</details>

## 许可证

Copyright © 2026 the Paperlines contributors and Yoav Yosif-Or. Paperlines 是自由软件，采用 [GNU Affero 通用公共许可证 v3.0 或更高版本](../../LICENSE)：你可以使用、研究、分享和修改它；如果你分发修改后的版本（包括将其作为网络服务运行），则必须以相同的许可证公开你的修改。

<sub>Claude、Codex、Gemini、Antigravity、Grok 和 Cursor 是其各自所有者的商标。这些名称和图标仅用于说明 Paperlines 可与哪些工具配合使用，并不代表其认可。助手图标来自 [Lobe Icons](https://github.com/lobehub/lobe-icons)（MIT 许可证，见 `src/assets/agents/LICENSE-lobe-icons.txt`）。</sub>

---

<p align="center">
  作者：<a href="https://github.com/yoav-yosifor"><strong>Yoav Yosif-Or</strong></a>
</p>
