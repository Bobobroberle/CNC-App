import { DEFAULT_FONT, FONT_IDS, type FontId } from '@lowrider/cam';
// The licence texts are the files in `licenses/`, imported as text when the app is built – so they travel in the single
// HTML file of the release and are read there without a network. Never retyped: a test holds the shown text to the file.
import hershey from '../../../../licenses/Hershey-Fonts-notice.txt?raw';
import ofl from '../../../../licenses/Relief-SingleLine-OFL.txt?raw';

/** The licences the faces of the CAM are under (the standard face is the app's own and has none) */
export type LicenceId = 'hershey' | 'ofl';
export const LICENCES: readonly LicenceId[] = ['hershey', 'ofl'];

export const LICENCE_TEXTS: Readonly<Record<LicenceId, string>> = { hershey, ofl };

/** A face that is not the app's own: it carries a notice (`FONT_CREDITS`) and a licence */
export type LicensedFace = Exclude<FontId, 'standard'>;

/**
 * Which licence each face of the data is under. A record over every face but the standard one: a face added to the
 * library without its licence fails the typecheck here, and `test/fontLicences.test.ts` walks `FONT_IDS` besides.
 */
export const FACE_LICENCE: Readonly<Record<LicensedFace, LicenceId>> = {
  simplex: 'hershey',
  script: 'hershey',
  modern: 'ofl',
};

/** The faces that carry a licence, in the order of the select */
export const LICENSED_FACES: readonly LicensedFace[] = FONT_IDS.filter(
  (id): id is LicensedFace => id !== DEFAULT_FONT,
);

/** The faces a licence covers */
export const facesUnder = (licence: LicenceId): LicensedFace[] =>
  LICENSED_FACES.filter((face) => FACE_LICENCE[face] === licence);
