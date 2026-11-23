import { createSharedProfile, parseSharedProfile } from '@lowrider/workshop';
import { useRef } from 'react';
import builtIn from '../../../../profiles/lowrider-v4.json';
import { t } from '../i18n';
import { downloadText } from '../lib/download';
import { readJobFile } from '../lib/files';
import { parseMacros } from '../lib/macros';
import { parseSettings, type ProfileSettings } from '../lib/profile';
import { useJob } from '../store/job';
import { useMachine } from '../store/machine';
import { useMacros } from '../store/macros';
import { useWorkshop } from '../store/workshop';
import { Button } from '../ui/button';
import { Card, CardTitle } from '../ui/card';

/** Community profiles: machine, tools, materials and macros as one JSON file. */
export function ProfileShareCard() {
  const profile = useJob((s) => s.profile);
  const setProfileSettings = useJob((s) => s.setProfileSettings);
  const macros = useMacros((s) => s.macros);
  const setMacros = useMacros((s) => s.setMacros);
  const { tools, materials, importLibraries } = useWorkshop.getState();
  const addLog = useMachine((s) => s.addLog);
  const input = useRef<HTMLInputElement>(null);

  const apply = (text: string) => {
    const r = parseSharedProfile<ProfileSettings>(text, parseSettings);
    if ('error' in r) {
      addLog('error', t('share.error', { reason: t(`share.errors.${r.error}`) }), 'share.error');
      return;
    }
    const p = r.profile;
    setProfileSettings(p.machine);
    importLibraries(p.tools, p.materials);
    const imported = parseMacros(p.macros);
    if (imported && imported.length > 0) {
      setMacros([...macros.filter((m) => !imported.some((n) => n.name === m.name)), ...imported]);
    }
    addLog(
      'info',
      t('share.imported', { name: p.name, tools: p.tools.length, materials: p.materials.length }),
    );
  };

  const exportProfile = () => {
    const shared = createSharedProfile({
      name: profile.name,
      machine: {
        travel: profile.travel,
        softLimits: profile.softLimits,
        jogFeed: profile.jogFeed,
        kinematics: profile.kinematics,
        controller: profile.controller,
        probe: profile.probe,
      },
      tools: useWorkshop.getState().tools,
      materials: useWorkshop.getState().materials,
      macros,
    });
    downloadText('lowrider-profil.json', JSON.stringify(shared, null, 2));
  };

  return (
    <Card className="gap-3 p-4" data-testid="profile-share" data-find="share">
      <CardTitle render={<h2 />}>{t('share.title')}</CardTitle>
      <p className="text-muted-foreground text-sm">
        {t('share.intro', { tools: tools.length, materials: materials.length })}
      </p>
      <div className="flex gap-3">
        <Button variant="outline" className="flex-1" onClick={exportProfile}>
          {t('share.export')}
        </Button>
        <Button variant="outline" className="flex-1" onClick={() => input.current?.click()}>
          {t('share.import')}
        </Button>
      </div>
      <Button variant="outline" onClick={() => apply(JSON.stringify(builtIn))}>
        {t('share.builtIn', { name: builtIn.name })}
      </Button>
      <input
        ref={input}
        type="file"
        accept=".json"
        hidden
        data-testid="profile-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void readJobFile(file).then(apply);
          e.target.value = '';
        }}
      />
    </Card>
  );
}
