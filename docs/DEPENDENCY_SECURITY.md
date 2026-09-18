# Dependency security verification

Web: Next.js and eslint-config-next 16.3.5; Sharp 0.35.4. npm lockfile updated normally. No forced audit fix, overrides, or major framework upgrade. Web `npm audit --omit=dev` reports **0 vulnerabilities**.

Official references checked:
- [Next.js August security release](https://nextjs.org/blog/august-2026-security-release): fixes included from 16.3.3 onward; registry stable patch selected was 16.3.5.
- [Sharp 0.35.4 release](https://github.com/lovell/sharp/releases/tag/v0.35.4) and [libheif advisory](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c).
- [Vercel Function limits](https://vercel.com/docs/functions/limitations): 4.5 MB Function request/response payloads.
- [Vercel request headers](https://vercel.com/docs/headers/request-headers): platform-overwritten client IP headers.
- [Supabase function permissions](https://supabase.com/docs/guides/database/functions) and [local migrations](https://supabase.com/docs/guides/local-development/database-migrations).

Compatible transitive web updates resolved baseline-browser-mapping, browserslist, fast-uri, hono, js-yaml and qs advisories. No remaining web audit exceptions.

## Mobile residual findings

The separate Expo SDK 54 workspace has **21 affected dependency entries: 9 high, 12 moderate, 0 critical**, after compatible updates. These counts include propagated parent-package findings, not 21 unique vulnerabilities. `expo install --check` and all 18 Expo Doctor checks pass. Four Expo patch updates were needed; no SDK migration was made.

Most remaining entries are Expo CLI/Metro/prebuild dependencies (image-size, postcss, uuid/xcode). They matter when bundling untrusted projects/assets or exposing development tooling; do not expose Metro to the internet. The query-string/decode-uri-component path also participates in routing; malformed external links should be treated as potentially applicable to the mobile runtime, not dismissed as build-only.

npm proposes incompatible Expo SDK 57/related major changes (and an inappropriate router downgrade for some paths). Remediation requires a separately reviewed Expo SDK upgrade with native builds/device tests, or upstream SDK-54 backports. No forced fix or untested override was applied. This is an open risk; mobile checks do not claim a clean audit.

| Package entry | Severity | Direct advisory / propagation |
|---|---|---|
| @expo/cli | high | @expo/config; @expo/config-plugins; @expo/metro; @expo/metro-config; @expo/prebuild-config |
| @expo/config | moderate | @expo/config-plugins |
| @expo/config-plugins | moderate | xcode |
| @expo/metro | high | metro; metro-config; metro-transform-worker |
| @expo/metro-config | high | @expo/config; @expo/metro; postcss |
| @expo/prebuild-config | moderate | @expo/config; @expo/config-plugins |
| decode-uri-component | moderate | [decode-uri-component: Denial of service via exponential decoding of malformed percent-encoded input](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr) |
| expo | high | @expo/cli; @expo/config; @expo/config-plugins; @expo/metro; @expo/metro-config; expo-asset; expo-constants |
| expo-asset | moderate | expo-constants |
| expo-constants | moderate | @expo/config |
| expo-linking | moderate | expo-constants |
| expo-router | moderate | expo-constants; expo-linking; query-string |
| expo-splash-screen | moderate | @expo/prebuild-config |
| image-size | high | [image-size: ICNS parser allows denial of service through an infinite loop](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr); [image-size: JXL and HEIF parsers allow denial of service through infinite loops](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq) |
| metro | high | image-size; metro-config; metro-transform-worker |
| metro-config | high | metro |
| metro-transform-worker | high | metro |
| postcss | high | [PostCSS has XSS via Unescaped </style> in its CSS Stringify Output](https://github.com/advisories/GHSA-qx2v-qp2m-jg93); [PostCSS: Arbitrary file read and information disclosure via attacker-controlled sourceMappingURL in CSS comments](https://github.com/advisories/GHSA-6g55-p6wh-862q); [PostCSS: incomplete fix of GHSA-6g55-p6wh-862q — attacker-controlled sourceMappingURL reads arbitrary .map files when `from` is unset](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp); [PostCSS: Path Traversal in Previous Source Map Auto-Loading (sourceMappingURL) leads to Arbitrary .map File Disclosure](https://github.com/advisories/GHSA-r28c-9q8g-f849) |
| query-string | moderate | decode-uri-component |
| uuid | moderate | [uuid: Missing buffer bounds check in v3/v5/v6 when buf is provided](https://github.com/advisories/GHSA-w5hq-g745-h8pq) |
| xcode | moderate | uuid |
