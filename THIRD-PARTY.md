# Third-party code and fonts in the app

LowRider Control ships as one HTML file with everything in it. Besides the packages listed in
`apps/control/package.json` (bundled by the build under their own licences: React, Base UI, Tailwind
CSS, three.js, zustand, fflate, esptool-js, lucide-react, class-variance-authority, clsx,
tailwind-merge), these are copied into the repository or the bundle: the UI components, the interface fonts
and the data of the single-line text faces (Hershey, Relief SingleLine).

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

## Hershey fonts

The text faces "Einfach" (Hershey Sans 1-stroke) and "Schreibschrift" (Hershey Script 1-stroke) of the CAM
(`packages/cam/src/fonts/simplex.ts` and `script.ts`) are the **Hershey Fonts**: vector fonts created by Dr. A. V.
Hershey at the U. S. National Bureau of Standards, in the `.jhf` form of James Hurt (Cognition, Inc.). They are read
from `futural.jhf` and `scripts.jhf` of <https://github.com/kamalmostafa/hershey-fonts> (which has them from
<http://emergent.unpythonic.net/software/hershey>), fetched 2026-11-27, and converted offline by
`scripts/fonts/convert.mjs` into the library's own packed stroke format – not into the format of the U.S. NTIS, which
the licence excludes. Only the outlines are Hershey's: the accented letters, ß, „, €, ° and the other characters the
data lacks are drawn by the library from its own glyphs, scaled to the face (`font.ts`), and nothing of the
repository's GPL-licensed library code is used. The licence of the data requires that the acknowledgements below
are distributed with the font data: they are in the header comment of both data files (a build drops comments) and,
shortened to the two acknowledgements, in the `credit` property of the very object that holds the glyphs (`SIMPLEX`,
`SCRIPT`), so they go wherever the data goes; the library exports them as `FONT_CREDITS`. A one-file bundle of the
library made with esbuild for this check (minified, `FONT_CREDITS` not used by the entry) still held both strings and
neither header comment; the project's own release build was not looked at. **The app shows no licences screen yet** –
it has none (no card, no page, and this file is not part of the release): a card that lists every non-null
`FONT_CREDITS` entry is an open item of the wiring of the faces. The notice as it comes with the Hershey fonts in SVG
(<https://www.evilmadscientist.com>):

> The Hershey Fonts are a set of vector fonts with a liberal license.
>
> USE RESTRICTION:
> This distribution of the Hershey Fonts may be used by anyone for any purpose, commercial or otherwise,
> providing that:
>
> 1. The following acknowledgements must be distributed with the font data:
>    - The Hershey Fonts were originally created by Dr. A. V. Hershey while working at the U. S. National
>      Bureau of Standards.
>    - The format of the Font data in this distribution was originally created by James Hurt, Cognition,
>      Inc., 900 Technology Park Drive, Billerica, MA 01821 (mit-eddie!ci-dandelion!hurt)
> 2. The font data in this distribution may be converted into any other format \*EXCEPT\* the format
>    distributed by the U.S. NTIS where each point is described in eight bytes as "xxx yyy:", where xxx and
>    yyy are the coordinate values as ASCII numbers.

The `COPYING` file of the kamalmostafa repository gives the data the same two conditions under "Copyright: 1967
Dr. A. V. Hershey, James Hurt" (word for word in its `hershey-fonts.notes`, where item 2 names the NTIS and reads "…
the U.S. NTIS (which organization holds the rights to the distribution and use of the font data in that particular
format)…"); both wordings are quoted in the data files. The `.jhf` files themselves carry no header. The SVG fonts
of the npm package `hersheytext` (the same data with further letters, whose origin could not be verified) were read
and compared, but nothing is taken from them: they differ from the originals in at least one glyph (the Script `^`
has two strokes there and three in the `.jhf`), and their ß ç Ç £ ¸ are drawn with curves and are not Hershey's.

## Relief SingleLine

The text face "Modern" (`packages/cam/src/fonts/modern.ts`) is converted from **Relief SingleLine**
(<https://github.com/isdat-type/Relief-SingleLine>, the file `fonts/open_svg/ReliefSingleLineSVG-Regular.svg`,
branch `master` as fetched on 2026-11-27, commit not pinned; the converter checks its SHA-256). It is licensed under
the SIL Open Font License, Version 1.1, whose text is kept in the repository as
`licenses/Relief-SingleLine-OFL.txt` (copied unchanged from the upstream `OFL.txt`). The data in the app is a
**Modified Version** in the sense of the OFL – the outlines converted into stroke data, stub strokes, kerning and
glyphs the app does not use left out – and so stays under the OFL (condition 5); the data file says so in its
header comment and in its `credit` property (what `FONT_CREDITS` exports: the copyright line, the name of the licence
and that the data is modified – **not the licence text**). The OFL asks that each copy of the Font Software carry the
licence; the text is only the file `licenses/Relief-SingleLine-OFL.txt`, and no build or release carries it yet. Open
item of the wiring of the faces, before a release that holds the face "Modern": a licences card in the app that shows
the notices of `FONT_CREDITS` and the OFL text (the file, imported as text), with a test that it renders them.
Copyright line of the upstream `OFL.txt`:

> Copyright 2022 The Relief SingleLine Project Authors (https://github.com/isdat-type/Relief-SingleLine)
>
> This Font Software is licensed under the SIL Open Font License, Version 1.1.

The SVG font file names 2021 in its metadata ("Copyright 2021 The Relief SingleLine Project Authors"), the upstream
`OFL.txt` 2022: both are given in the data file, which of them is the intended year could not be told from the
files. No Reserved Font Name follows the copyright line.
