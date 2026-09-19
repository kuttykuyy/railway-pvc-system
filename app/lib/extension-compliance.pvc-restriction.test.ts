import { describe, expect, it } from 'vitest';
import { isPvcRestrictedContract } from './extension-compliance';

/**
 * GCC-2022, note under Clause 17B: once time has been allowed under 17B, a further 17A
 * extension may be granted without LD, "However, Price variation during such
 * extension(s) shall be dealt as applicable for extension(s) of time under clause 17B."
 *
 * So the restriction is permanent. The bug these cover: `contract.extensionType` only
 * ever holds the LATEST extension's type, so a 17A granted after a 17B used to clear
 * the cap and overpay.
 */
describe('a contract that has had a 17B extension', () => {
  it('stays restricted when a 17A extension is granted afterwards', () => {
    const contract = { extensionType: '17A' }; // latest type, overwritten by the 17A
    const extensions = [{ extensionType: '17B' }, { extensionType: '17A' }];
    expect(isPvcRestrictedContract(contract, extensions)).toBe(true);
  });

  it('is restricted while the 17B is still the latest extension', () => {
    expect(isPvcRestrictedContract({ extensionType: '17B' }, [{ extensionType: '17B' }])).toBe(true);
  });

  it('stays restricted across several later 17A extensions', () => {
    const extensions = [
      { extensionType: '17A' },
      { extensionType: '17B' },
      { extensionType: '17A' },
      { extensionType: '17A' },
    ];
    expect(isPvcRestrictedContract({ extensionType: '17A' }, extensions)).toBe(true);
  });
});

describe('a contract that has never had a 17B extension', () => {
  it('is not restricted with only 17A extensions', () => {
    const extensions = [{ extensionType: '17A' }, { extensionType: '17A' }];
    expect(isPvcRestrictedContract({ extensionType: '17A' }, extensions)).toBe(false);
  });

  it('is not restricted with no extensions at all', () => {
    expect(isPvcRestrictedContract({ extensionType: null }, [])).toBe(false);
  });
});

describe('contracts that carry a type but no extension rows', () => {
  // Older records, and the Telegram flow, set the contract field directly without
  // writing a ContractExtension row. Those must still be honoured.
  it('falls back to the contract field when the rows are empty', () => {
    expect(isPvcRestrictedContract({ extensionType: '17B' }, [])).toBe(true);
  });

  it('falls back to the contract field when the rows were not loaded', () => {
    expect(isPvcRestrictedContract({ extensionType: '17B' }, undefined)).toBe(true);
    expect(isPvcRestrictedContract({ extensionType: '17B' }, null)).toBe(true);
  });

  it('does not invent a restriction for a 17A-only contract', () => {
    expect(isPvcRestrictedContract({ extensionType: '17A' }, undefined)).toBe(false);
  });
});
