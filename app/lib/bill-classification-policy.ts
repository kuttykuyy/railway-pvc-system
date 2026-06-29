import { prisma } from './db';
import { hasDedicatedClassificationSuffix, inferMainClassification } from './work-classification';

interface ClassificationEntryInput {
  subClassificationId?: string | null;
  classificationId?: string | null;
}

interface DedicatedAmountsInput {
  cementAmount?: unknown;
  steelTmtBarsAmount?: unknown;
  steelAngleChannelAmount?: unknown;
  steelPlatesAmount?: unknown;
  steelOtherSectionsAmount?: unknown;
}

const amount = (value: unknown) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

export async function resolveBillClassificationPolicy(
  workDescription: string,
  entries: ClassificationEntryInput[],
  dedicated: DedicatedAmountsInput,
) {
  const subIds = [...new Set(entries.map(entry => entry.subClassificationId).filter(Boolean))] as string[];
  const legacyIds = [...new Set(entries.map(entry => entry.classificationId).filter(Boolean))] as string[];
  const [subClassifications, legacyClassifications] = await Promise.all([
    subIds.length > 0
      ? prisma.subClassification.findMany({
          where: { id: { in: subIds } },
          select: { id: true, code: true },
        })
      : Promise.resolve([]),
    legacyIds.length > 0
      ? prisma.classification.findMany({
          where: { id: { in: legacyIds } },
          select: { id: true, code: true },
        })
      : Promise.resolve([]),
  ]);
  const codes = [...subClassifications.map(item => item.code), ...legacyClassifications.map(item => item.code)];
  const requiredMain = inferMainClassification(workDescription);
  const invalidCodes = codes.filter(code => !String(code).startsWith(requiredMain.code));
  const hasSteelClassification = hasDedicatedClassificationSuffix(codes, 'B');
  const hasCementClassification = hasDedicatedClassificationSuffix(codes, 'C');

  return {
    requiredMain,
    invalidCodes,
    codes,
    cementAmount: hasCementClassification ? 0 : amount(dedicated.cementAmount),
    steelTmtBarsAmount: hasSteelClassification ? 0 : amount(dedicated.steelTmtBarsAmount),
    steelAngleChannelAmount: hasSteelClassification ? 0 : amount(dedicated.steelAngleChannelAmount),
    steelPlatesAmount: hasSteelClassification ? 0 : amount(dedicated.steelPlatesAmount),
    steelOtherSectionsAmount: hasSteelClassification ? 0 : amount(dedicated.steelOtherSectionsAmount),
  };
}
