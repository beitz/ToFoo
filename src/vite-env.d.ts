/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/vanillajs" />
/** Set at build time (vite.config.ts, scripts/app-version.ts): `0.1.146`. */
declare const __APP_VERSION__: string;
/** Short commit hash of the build, '' outside a git checkout. */
declare const __APP_COMMIT__: string;
/** ISO time of the build. */
declare const __APP_BUILT_AT__: string;
/** Version and merge time (ISO) of every merged pull request, by number; empty without the git history. */
declare const __APP_RELEASES__: Record<number, { version: string; date: string }>;
