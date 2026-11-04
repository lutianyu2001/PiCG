# CLAUDE.md

PiCG is a browser-only image host on GitHub: an Angular app that stores images in the user's own repository through
the GitHub REST API with a fine-grained token. `docs/spec.md` is the functional spec; README.md covers usage.

## Commands

| Command          | What it does                                                                            |
| ---------------- | --------------------------------------------------------------------------------------- |
| `pnpm dev`       | Development server                                                                      |
| `pnpm build`     | Production build into `dist/picg`                                                       |
| `pnpm lint`      | ESLint over `src`, `scripts` and `e2e`                                                  |
| `pnpm typecheck` | Type check with the Angular compiler                                                    |
| `pnpm test`      | Unit tests (Vitest)                                                                     |
| `pnpm e2e`       | End-to-end tests of the built site against a fake GitHub API (run `pnpm build` first)   |
| `pnpm e2e:real`  | Smoke test against the real GitHub API; needs `PICG_E2E_TOKEN_FILE` and `PICG_E2E_REPO` |

The Angular CLI needs Node.js ≥24.15; the pnpm-managed Node.js 24.22.2 (devEngines) is in
`node_modules/.pnpm/node@runtime+24.22.2*/node_modules/node/bin`.

## Lessons

- GitHub blocks repositories after a DMCA takedown and then answers HTTP 451 to every request on them, while they
  still appear in `/user/repos`. The owner cannot delete such a repository, so an account may hold one for good
  (q0wkp/apps.apple.com does). Any code that walks over the user's repositories must treat 451 as "blocked, skip
  it", never as a network error or a reason to stop: treating it as an error has broken sign-in twice, through the
  check that the token cannot write to other repositories. The client maps 451 to the `blocked` error kind; a test
  in `e2e/app.spec.ts` covers a blocked repository. Seen on 2026-11-04 with REST API version 2022-11-28.
- Playwright 1.64.1 writes the page's accessibility snapshot into `error-context.md` when a test fails, password
  input values included, and has no option to turn this off. Never read the raw output of a test that typed a real
  token; `pnpm e2e:real` goes through `scripts/e2e-real.mjs`, which keeps only the text reports with the token
  replaced.
- In the end-to-end tests, signing in ends by opening the library, so an action right after the sign-in click
  (such as opening Settings) can be undone when it finishes; tests that expect success wait for `#/library` first
  (`signInToLibrary` in `e2e/app.spec.ts`). It passed locally and failed only on the slower GitHub runner
  (Playwright 1.64.1). After every push, check the CI run of that very commit, not an earlier one.
- @angular/service-worker 22.2.4 looks for a new version only about five seconds after the page is opened (it
  also fetches ngsw.json once when it installs), never while a page stays open; the app calls checkForUpdate itself.
  A test that waits for "the" manifest fetch can match the install-time one and pass by luck, so the test in
  `e2e/app.spec.ts` counts two fetches before publishing the new version, and was checked to fail without the fix.
- @angular/material 22.2.5 turns all its animations (ripples, dialogs, menus) off when the system asks for reduced
  motion, reading the media query once per page through the CDK MediaMatcher; the MATERIAL_ANIMATIONS token can
  only turn them off, not on. A device with reduced motion therefore shows no motion at all, which looks like
  the app has none. `src/app/core/motion.ts` overrides MediaMatcher for that query when motion is set to "on".
- The token obfuscation key in `src/app/core/obfuscate.ts` holds the former name, PicG; changing it would make every
  stored token unreadable, so the rename to PiCG left it alone. Storage prefixes (`PICG_`), `.picg/settings.toml`
  and `picg.lu.fm` are data or addresses, not the displayed name, and stay as they are.
- In @angular/material 22.2.5 an icon button draws its icon's SVG at 24 px whatever size the mat-icon is given, and
  mat-icon clips its overflow, so shrinking a mat-icon cuts the icon off (the sun and moon were cut this way). To
  make an icon look smaller, widen its viewBox instead (`withMargin` in `src/app/core/icons.ts`). Check icons in a
  screenshot taken at deviceScaleFactor 3; at 1x the clipping was not visible.
- actions/deploy-pages@v4 waits at most 10 minutes. On 2026-11-04 a Pages deployment stayed in "updating_pages" on
  GitHub's side until that timeout, and the run of the next push then failed with "due to in progress deployment"
  (status 400) again and again: the stuck deployment read "deployment_cancelled", even after cancelling it
  through the API, and still blocked every new one. What cleared it was switching Settings > Pages > Source away
  from GitHub Actions and back (done by the user), then rerunning the deploy (`gh run rerun <id>`). The site keeps
  the last good version meanwhile. Check the deploy run of the latest commit, not only CI.
- Layouts that change with width are checked at common laptop widths (1024, 1152, 1366 px) with the sidebar
  expanded, which takes 208 px; the sign-in page first split into two columns only from 60rem, so on the user's
  screen it stayed one narrow column unless the sidebar was collapsed, while a check at 1280 px looked fine.

## Decisions

- The user's own decisions and texts from the PicX-based PiCG may be reused; only PicX's code may not ("我给你的决策当然
  不算在gpl协议里, 所以你当然可以复用啊, 你不能抄的只是原项目而已!", 2026-11-04). Those decisions are in the user's
  messages of the earlier session, `~/.claude/projects/-home-suroot-PicG/1078d668-f081-4ed5-bd77-8c86ae0acc3e.jsonl`
  (old code: commit 0bb4421); check them before changing a feature they cover. Among them: the skip-check dialog
  wording with "算了" and a red "我已知晓风险，继续", the disclaimer in settings and help ("不保证代码 100% 安全,
  use it at your own risk"), at most 1000 files per folder with failures saying why, grey placeholders, toasts that
  do not cover the bottom bar, no keyboard shortcuts, the custom-domain field showing the main site's domain/repo in
  grey, and a "new version" refresh notice, which must also reach a page left open: PicX checked every ten minutes
  and when the page came back into view, and the user found it missing ("原来就有的新版本检测功能也没了啊",
  2026-11-04) when the rewrite only checked on opening. The disclaimer later left settings and stays on the About
  page ("设置里有个多余的免责声明移除掉", 2026-11-04).
- The sign-in page greets like Claude does, warmly and varied by time of day, and has no logo of its own; only the
  greeting part varies, "欢迎来到 PiCG" is written once (user, 2026-11-04).
- Fonts were decided for the PicX-based version and must stay: Inter and Noto Sans for text, Josefin Sans for Latin
  titles, from jsDelivr with an npmmirror fallback. The rewrite first dropped them and the user asked on
  2026-11-04 "我原来让你用的标题字体呢? 怎么没了?"; when rewriting or restyling, carry over such earlier choices.
- The user decided on 2026-11-04 that the program recommends gh-pages as the name of the image repository's
  default branch ("程序里也要说推荐默认branch名为gh-pages"); q0wkp/picg-images-hosting was renamed from master to
  gh-pages accordingly.
- Navigation order is library, toolbox, settings, about: the user moved settings to sit right above about
  ("设置挪到关于上边", 2026-11-04).
- The app has motion: Angular Material's animations and Angular's own (`animate.enter` / `animate.leave`, router
  view transitions) are used ("现在程序没有任何动效, angular ui 有动效功能吗? 有的话就用上", 2026-11-04).
- The top-bar theme button uses Bootstrap Icons' sun-fill and moon-stars-fill (the icons of the Apache Airflow
  site, which the user likes) and only switches between light and dark: "直接点击轮换, 没有跟随系统的选项"
  (2026-11-04). Following the system stays in settings.
- The repository and the project are named PiCG, with a capital C ("给仓库改名叫 PiCG 吧, C改成大写", 2026-11-04;
  the user chose to rename the project too). The repository is lutianyu2001/PiCG.
- The README gets a disclaimer for GitHub only if GitHub's rules ask for one ("如果 github 有规则要求 disclaimer,
  那就加上, 否则就保留现状", 2026-11-04). Its logo rules and trademark policy, checked on 2026-11-04, only forbid
  suggesting affiliation or endorsement, so there is none.
- The button that collapses and expands the navigation sits under the navigation items, lined up with their icons,
  not centred in the sidebar; the user asked for the common convention ("挑一个大家通行的做法", 2026-11-04).
  Collapsing keeps the toggle and the icons still and folds the right side to the left; the toggle first jumping
  to the middle was rejected ("应该是按钮保持不动右边往左收才对", 2026-11-04).
- The README opens with one sentence that says PiCG is an image host; the PicX history goes in the overview
  ("这玩意就是个图床啊, 但是你简介写的又臭又长谁知道他是图床?", 2026-11-04).
- On wide screens the sign-in card uses the width, in two columns (steps left, form right) rather than one
  stretched column ("首页只占中间一小块儿, 为什么不往两遍拉宽点?", 2026-11-04).
- Since the product went live, history is not rewritten any more: changes go in as ordinary commits with ordinary
  pushes, no squashing or force pushes ("不用force push 了, 之前让你合并是因为要优化历史, 现在产品上线就不用优化历史了",
  2026-11-04). The squash into one Initial commit was a clean-up before launch; the user asked for it once more
  right after, as an exception ("这次是特例, 全合并到 initial commit 里然后 force push", 2026-11-04).
- Toasts, the new-version notice included, keep Material 3's inverse colours (dark on a light theme, light on a
  dark one); the user accepted this on 2026-11-04 ("那行那就这样").
- Cloudflare R2 is a second kind of storage (the user asked for it on 2026-11-04). A session uses one kind,
  GitHub or R2, not both: "二选一, 反正登录是记忆的, 退出登录以后可以像steam选择用户一样一键登录所以并不麻烦"; so
  signed-in accounts are remembered and listed on the sign-in page for one-click sign-in. An R2 bucket must have a
  public address (custom domain or r2.dev); the user chose this over allowing buckets without one.
- Importing and syncing images between GitHub and R2, in both directions, is to be built later, not with the first
  R2 version: "双向互导、同步功能要做, 不过你先记下来这个计划, 这次先不做" (2026-11-04; milestone 10 in the spec).
