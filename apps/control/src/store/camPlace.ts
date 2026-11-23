import { useCam } from './cam';
import { useJob } from './job';
import { useUi } from './ui';

/**
 * The one way into the drawing workspace (CAM): the "Zeichnen" button, the quick search and the
 * link of the series flow all come here. It opens an empty drawing where there is none and shows
 * the table from above; a program that is loaded stays loaded (the drawing says so and offers to
 * put itself on the table).
 */
export function openCam(): void {
  useCam.getState().open();
  useJob.getState().setProjection('top');
  useUi.getState().go('cam');
}
