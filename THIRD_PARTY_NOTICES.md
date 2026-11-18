# Third-party notices

Afterlife is MIT licensed (see [LICENSE](LICENSE)). The deployed site also serves the third-party software and fonts below to visitors. Each keeps its own licence. This list is a courtesy notice, not legal advice.

## Served to visitors

| Software                                      | Version                | Licence                   | How it is used                                                                                                                                                                                                                          | Source                                                                                                                               |
| --------------------------------------------- | ---------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| js-dos (with DOSBox, compiled to WebAssembly) | 8.5.4                  | GPL-2.0                   | Runs the sample DOS apps in the browser. Used unmodified: `apps/web/scripts/copy-jsdos.mjs` copies `emulators.js`, `wdosbox.js` and `wdosbox.wasm` from the npm package into `public/js-dos` at build time. Not committed to this repo. | [github.com/caiiiycuk/js-dos](https://github.com/caiiiycuk/js-dos), [npm js-dos 8.5.4](https://www.npmjs.com/package/js-dos/v/8.5.4) |
| IBM Plex Mono                                 | via `next/font/google` | SIL Open Font License 1.1 | The DOS text font                                                                                                                                                                                                                       | [github.com/IBM/plex](https://github.com/IBM/plex)                                                                                   |
| Inter                                         | via `next/font/google` | SIL Open Font License 1.1 | The UI font                                                                                                                                                                                                                             | [github.com/rsms/inter](https://github.com/rsms/inter)                                                                               |
| Noto Nastaliq Urdu                            | via `next/font/google` | SIL Open Font License 1.1 | Urdu text                                                                                                                                                                                                                               | [github.com/notofonts/nastaliq](https://github.com/notofonts/nastaliq)                                                               |

## In the sample apps and the screen decoder

- **Open Watcom v2** (2026-11-01 build, Sybase Open Watcom Public License 1.0) compiles the sample DOS apps in `samples/graveyard`. The EXEs in `samples/graveyard/dist` and the `.jsdos` bundles include its C runtime library. [github.com/open-watcom/open-watcom-v2](https://github.com/open-watcom/open-watcom-v2)
- **The VGA font** in `packages/screen/src/vga-font.ts` is read off the js-dos screen (`pnpm screen:capture`), so it is DOSBox's copy of the IBM VGA ROM font, used to recognise characters.

The npm dependencies used to build and test the project are listed in `pnpm-lock.yaml` with their own licences.
