import { describe, expect, it } from 'vitest';
import {
  isWeightBilledUnit,
  itemExcludesSteelSupply,
  itemSuppliesItsOwnSteel,
  resolveMaterialSuffix,
} from './steel-supply-classification';

const suffixFor = (description: string, unit: string, isSteelItem = true) =>
  resolveMaterialSuffix({
    description,
    unit,
    isSteelItem,
    supportsFabricationClasses: true,
    isDirectCementSupply: false,
  }).suffix;

describe('itemSuppliesItsOwnSteel', () => {
  // None of the schedules of rates ever print the words "including steel".
  it('reads the wordings the schedules actually use', () => {
    expect(itemSuppliesItsOwnSteel('Supplying, fabrication, assembling of all types of steel girders of specified spans with structural steel conforming to IS:2062')).toBe(true);
    expect(itemSuppliesItsOwnSteel('Fabrication & supply of Galvanized Steel Channel Sleepers made from ISMC 150mm x 75mm standard rolled section')).toBe(true);
    expect(itemSuppliesItsOwnSteel('Removing of existing bed plate from existing bed block, supply, fabrication and erection of new bed plate')).toBe(true);
    expect(itemSuppliesItsOwnSteel('Manufacture and supply of Hook Bolt 28mm dia as per RDSO Drg. no. BA-1636/I/R2')).toBe(true);
  });

  it('does not read erection of someone else\'s steel as supplying it', () => {
    expect(itemSuppliesItsOwnSteel('Assembling and erection of fabricated Steel girders on bearings at site with crane/derrick')).toBe(false);
    expect(itemSuppliesItsOwnSteel('Launching in position, by any approved method, pre-fabricated Steel Girders')).toBe(false);
  });
});

describe('itemExcludesSteelSupply', () => {
  it('reads free-issue and railway-supplied steel', () => {
    expect(itemExcludesSteelSupply('Fabrication and erection excluding steel supply')).toBe(true);
    expect(itemExcludesSteelSupply('Erection of girders, steel supplied by Railway')).toBe(true);
    expect(itemExcludesSteelSupply('Erecting trusses, steel will be issued free by the Railways')).toBe(true);
  });
});

describe('isWeightBilledUnit', () => {
  it('accepts the weight units bills actually print', () => {
    for (const unit of ['kg', 'Kg', 'MT', 'M.T.', 'Tonne', 'Tonnes', 'quintal', 'Qtl.', 'QTL']) {
      expect(isWeightBilledUnit(unit), unit).toBe(true);
    }
    for (const unit of ['sqm', 'cum', 'metre', 'TRM', 'each', '']) {
      expect(isWeightBilledUnit(unit), unit).toBe(false);
    }
  });
});

describe('resolveMaterialSuffix', () => {
  it('keeps reinforcement supply on B', () => {
    // DSR 5.22.6, as printed.
    expect(suffixFor('Steel reinforcement for R.C.C. work including straightening, cutting, bending, placing in position and binding all complete', 'kg')).toBe('B');
  });

  it('puts structural steel supplied and fabricated on D, not general work', () => {
    // USSOR 041011 and 195010 — both used to come out A.
    expect(suffixFor('Supplying, fabrication, assembling of all types of steel girders of specified spans with structural steel conforming to Quality "B0" Grade Designation E250 conforming to IS:2062, erection of the same', 'MT')).toBe('D');
    expect(suffixFor('Fabrication & supply of Galvanized Steel Channel Sleepers made from ISMC 150mm x 75mm standard rolled section conforming to IS:2062', 'MT')).toBe('D');
    expect(suffixFor('Removing of existing bed plate from existing bed block, supply, fabrication and erection of new bed plate of approved sizes', 'Kg')).toBe('D');
  });

  it('still puts erection of steel the contractor did not buy outside D', () => {
    expect(suffixFor('Assembling and erection of fabricated Steel girders on bearings at site with crane/derrick', 'MT')).not.toBe('D');
    expect(suffixFor('Fabrication and erection of steel trusses, steel supplied by Railway', 'MT')).toBe('E');
  });

  it('does not make a non-steel item D on supply-and-erect wording alone', () => {
    expect(suffixFor('Supply and erection of precast RCC fencing posts', 'each', false)).toBe('A');
  });

  it('leaves dismantling of steelwork as general work', () => {
    // DSR 15.18, billed in kg like a supply item.
    expect(suffixFor('Dismantling steel work in built up sections in angles, tees, flats and channels including all gusset plates, bolts, nuts, cutting rivets, welding etc.', 'kg')).toBe('A');
  });

  it('does not offer D or E to group 1, which has no such sub-class', () => {
    const result = resolveMaterialSuffix({
      description: 'Supplying, fabrication and erection of steel liners for earthwork',
      unit: 'MT',
      isSteelItem: true,
      supportsFabricationClasses: false,
      isDirectCementSupply: false,
    });
    expect(result.suffix).not.toBe('D');
    expect(result.suffix).not.toBe('E');
  });

  it('lets a cement supply item through untouched', () => {
    const result = resolveMaterialSuffix({
      description: 'Supply of Ordinary Portland Cement 43 grade',
      unit: 'MT',
      isSteelItem: false,
      supportsFabricationClasses: true,
      isDirectCementSupply: true,
    });
    expect(result.suffix).toBe('C');
  });
});
