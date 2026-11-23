# Third-party code and fonts in the app

LowRider Control ships as one HTML file with everything in it. Besides the packages listed in
`apps/control/package.json` (bundled by the build under their own licences: React, Base UI, Tailwind
CSS, three.js, zustand, fflate, esptool-js, lucide-react, class-variance-authority, clsx,
tailwind-merge), three things are copied into the repository or the bundle:

## coss ui

The components in `apps/control/src/ui/` and the colour tokens in
`apps/control/src/styles/theme.css` are taken from **coss ui** (<https://coss.com/ui>, registry
`https://coss.com/ui/r/<name>.json`) and changed for this app (touch sizes, dialogs that never cover
NOT-HALT – each file says what was changed). coss ui is a copy-and-own component collection by
Cal.com, Inc., built on Base UI and Tailwind CSS. Its publisher states that it is MIT licensed
("coss ui, kloq, qnot and Shipyard, which are MIT licensed", <https://coss.com>, read 2026-11-19).

> MIT License
>
> Copyright (c) Cal.com, Inc. (coss ui)
>
> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
> associated documentation files (the "Software"), to deal in the Software without restriction,
> including without limitation the rights to use, copy, modify, merge, publish, distribute,
> sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all copies or
> substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT
> NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
> NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
> DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT
> OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

The licence file of the coss ui repository itself could not be read from the build environment;
the copyright line above names the publisher as given on coss.com. Replace it with the line from
the upstream `LICENSE` if it differs.

## Inter

The font **Inter** (variable, latin subset only) is bundled into the HTML file from the package
`@fontsource-variable/inter`, so the app needs no network for its type. Inter is licensed under the
SIL Open Font License 1.1 (<https://openfontlicense.org>); the licence text ships with the package
(`node_modules/@fontsource-variable/inter/LICENSE`). Copyright (c) 2016 The Inter Project Authors
(<https://github.com/rsms/inter>).

## JetBrains Mono

The font **JetBrains Mono** (variable, latin subset only) is bundled the same way, from the package
`@fontsource-variable/jetbrains-mono`, for G-code, the log and the console (DESIGN.md §7). It is
licensed under the SIL Open Font License 1.1; the licence text ships with the package
(`node_modules/@fontsource-variable/jetbrains-mono/LICENSE`). Copyright 2020 The JetBrains Mono
Project Authors (<https://github.com/JetBrains/JetBrainsMono>).

## Lucide

The icons of the shell (status bar, steps, menu, action bar) come from **Lucide** through the
package `lucide-react` (ISC licence, <https://lucide.dev>); only the icons that are used end up in
the bundle.
