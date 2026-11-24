import { learnedFactor, learningKey, suggestFor } from '@lowrider/workshop';
import { useState } from 'react';
import { t } from '../i18n';
import { formatNumber } from '../lib/format';
import { useWorkshop } from '../store/workshop';
import { HoldButton } from './HoldButton';
import { Alert } from '../ui/alert';
import { Card, CardTitle } from '../ui/card';
import { Field, FieldLabel } from '../ui/field';
import { NativeSelect } from '../ui/native-select';

/** Feeds and speeds for a tool/material pair, corrected by what earlier jobs taught. */
export function CuttingAdvisor({
  toolId: fixedTool,
  materialId: fixedMaterial,
}: { toolId?: string; materialId?: string | null } = {}) {
  const tools = useWorkshop((s) => s.tools);
  const materials = useWorkshop((s) => s.materials);
  const learning = useWorkshop((s) => s.learning);
  const spindle = useWorkshop((s) => s.settings.spindle);
  const { resetLearning } = useWorkshop.getState();
  const [toolId, setToolId] = useState(fixedTool ?? tools[0]?.id ?? '');
  const [materialId, setMaterialId] = useState(fixedMaterial ?? materials[0]?.id ?? '');
  const tool = tools.find((x) => x.id === (fixedTool ?? toolId));
  const material = materials.find((m) => m.id === (fixedMaterial ?? materialId));
  if (!tool || !material) return null;
  const factor = learnedFactor(learning, tool.id, material.id);
  const jobs = learning[learningKey(tool.id, material.id)]?.jobs ?? 0;
  const s = suggestFor(tool, material, spindle, factor);

  return (
    <Card className="gap-3 p-4" data-testid="cutting-advisor" data-find="cutting">
      <CardTitle render={<h2 />}>{t('cutting.title')}</CardTitle>
      {fixedTool === undefined ? (
        <Field>
          <FieldLabel>{t('cutting.tool')}</FieldLabel>
          <NativeSelect value={toolId} onChange={(e) => setToolId(e.target.value)}>
            {tools.map((x) => (
              <option key={x.id} value={x.id}>
                T{x.number} {x.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
      ) : null}
      {fixedMaterial === undefined ? (
        <Field>
          <FieldLabel>{t('cutting.material')}</FieldLabel>
          <NativeSelect value={materialId} onChange={(e) => setMaterialId(e.target.value)}>
            {materials.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
      ) : null}
      <dl className="facts">
        <dt>{t('cutting.rpm')}</dt>
        <dd className="font-semibold text-3xl">{formatNumber(s.rpm)}</dd>
        <dt>{t('cutting.feed')}</dt>
        <dd className="font-semibold text-3xl">{formatNumber(s.feed)}</dd>
        <dt>{t('cutting.plunge')}</dt>
        <dd>{formatNumber(s.plunge)} mm/min</dd>
        <dt>{t('cutting.depth')}</dt>
        <dd>{formatNumber(s.depthPerPass, 2)} mm</dd>
        <dt>{t('cutting.stepover')}</dt>
        <dd>{formatNumber(s.stepover, 2)} mm</dd>
        <dt>{t('cutting.chipLoad')}</dt>
        <dd>{formatNumber(s.chipLoad, 3)} mm</dd>
      </dl>
      {s.limits.map((l) => (
        <Alert key={l} variant="warning">
          {t(`cutting.limits.${l}`)}
        </Alert>
      ))}
      <p className="text-muted-foreground text-sm">
        {jobs > 0
          ? t('cutting.learned', { factor: formatNumber(factor * 100), jobs })
          : t('cutting.notLearned')}
      </p>
      {material.notes ? <p className="text-muted-foreground text-sm">{material.notes}</p> : null}
      {fixedTool === undefined && Object.keys(learning).length > 0 ? (
        <HoldButton onConfirm={resetLearning}>{t('cutting.resetLearning')}</HoldButton>
      ) : null}
    </Card>
  );
}
