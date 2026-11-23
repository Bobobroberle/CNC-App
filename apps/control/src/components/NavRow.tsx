import { HouseIcon, MenuIcon } from 'lucide-react';
import { useState } from 'react';
import { t } from '../i18n';
import { useSteps } from '../store/steps';
import { AREAS, STEPS, useUi, type Area } from '../store/ui';
import { useWorkshop } from '../store/workshop';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogClose,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from '../ui/dialog';
import { Stepper, StepperStep } from '../ui/stepper';
import { AreaIcon } from './AreaIcon';
import { FindButton } from './Find';

/** The side areas the menu offers: the console only with the expert functions switched on. */
export function useAreas(): Area[] {
  const expert = useWorkshop((s) => s.settings.expertMode);
  return AREAS.filter((area) => area !== 'console' || expert);
}

/**
 * The second row of the shell (DESIGN.md §4): where the operator is. Start,
 * the five steps of the flow with their states – each can be jumped to – and
 * the main menu with the side areas. In a side area the menu button carries
 * that area's name: the place is always named.
 */
export function NavRow() {
  const place = useUi((s) => s.place);
  const go = useUi((s) => s.go);
  const { states } = useSteps();
  const areas = useAreas();
  const [menu, setMenu] = useState(false);
  const area = areas.find((a) => a === place);
  return (
    <nav className="navrow" aria-label={t('nav.label')}>
      <Button
        variant="ghost"
        className="nav-start"
        aria-current={place === 'start' ? 'page' : undefined}
        data-find="place-start"
        onClick={() => go('start')}
      >
        <HouseIcon aria-hidden="true" />
        <span>{t('nav.start')}</span>
      </Button>
      <Stepper aria-label={t('nav.stepper')} className="nav-stepper">
        {STEPS.map((step, i) => (
          <StepperStep
            key={step}
            number={i + 1}
            label={t(`nav.steps.${step}`)}
            state={states[step]}
            stateLabel={t(`nav.states.${states[step]}`)}
            current={place === step}
            data-find={`place-${step}`}
            data-testid={`step-${step}`}
            onClick={() => go(step)}
          />
        ))}
      </Stepper>
      <span className="nav-space" />
      <FindButton />
      <Dialog open={menu} onOpenChange={setMenu}>
        <Button
          variant="ghost"
          className="nav-menu"
          aria-current={area ? 'page' : undefined}
          aria-haspopup="dialog"
          data-testid="menu-button"
          data-find="menu"
          onClick={() => setMenu(true)}
        >
          {area ? <AreaIcon area={area} /> : <MenuIcon aria-hidden="true" />}
          <span>{area ? t(`nav.areas.${area}`) : t('nav.menu')}</span>
        </Button>
        <DialogPopup className="max-w-md" data-testid="menu">
          <DialogHeader>
            <DialogTitle>{t('nav.menuTitle')}</DialogTitle>
          </DialogHeader>
          <DialogPanel className="flex flex-col gap-2">
            {areas.map((a) => (
              <Button
                key={a}
                variant="outline"
                size="lg"
                className="justify-start"
                aria-current={place === a ? 'page' : undefined}
                data-find={`place-${a}`}
                onClick={() => {
                  setMenu(false);
                  go(a);
                }}
              >
                <AreaIcon area={a} />
                <span className="flex min-w-0 flex-col items-start text-left">
                  <span>{t(`nav.areas.${a}`)}</span>
                  <span className="font-normal text-muted-foreground text-sm">
                    {t(`nav.areaHints.${a}`)}
                  </span>
                </span>
              </Button>
            ))}
          </DialogPanel>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>{t('nav.menuClose')}</DialogClose>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </nav>
  );
}
