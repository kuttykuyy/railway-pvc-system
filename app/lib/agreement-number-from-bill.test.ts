import { beforeEach, describe, expect, it, vi } from 'vitest';

const contract = { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() };
vi.mock('./db', () => ({ prisma: { contract } }));

const { fillAgreementNumberFromBill } = await import('./agreement-number-from-bill');

const provisional = { id: 'c1', agreementNo: '10699560129108', loaNo: '10699560129108' };
const settled = { id: 'c1', agreementNo: 'SR/TPJ/Civil/2025/0067', loaNo: '10699560129108' };

describe('fillAgreementNumberFromBill', () => {
  beforeEach(() => {
    contract.findUnique.mockReset();
    contract.findFirst.mockReset().mockResolvedValue(null);
    contract.update.mockReset().mockResolvedValue({});
  });

  it('takes the number from the bill while the contract stands on its LOA number', async () => {
    contract.findUnique.mockResolvedValue(provisional);
    const result = await fillAgreementNumberFromBill('c1', 'SR/TPJ/Civil/2025/0067');
    expect(result.applied).toBe(true);
    expect(result.to).toBe('SR/TPJ/Civil/2025/0067');
    expect(contract.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { agreementNo: 'SR/TPJ/Civil/2025/0067' },
    });
  });

  it('leaves a contract that already has its own agreement number alone', async () => {
    contract.findUnique.mockResolvedValue(settled);
    const result = await fillAgreementNumberFromBill('c1', 'SR/TPJ/Civil/2025/9999');
    expect(result.applied).toBe(false);
    expect(contract.update).not.toHaveBeenCalled();
  });

  it('refuses when another contract already holds that number', async () => {
    contract.findUnique.mockResolvedValue(provisional);
    contract.findFirst.mockResolvedValue({ id: 'c2' });
    const result = await fillAgreementNumberFromBill('c1', 'SR/TPJ/Civil/2025/0067');
    expect(result.applied).toBe(false);
    expect(result.reason).toMatch(/Another contract/);
    expect(contract.update).not.toHaveBeenCalled();
  });

  it('does nothing when the bill prints no agreement number', async () => {
    const result = await fillAgreementNumberFromBill('c1', '   ');
    expect(result.applied).toBe(false);
    expect(contract.findUnique).not.toHaveBeenCalled();
  });

  it('does nothing when the bill prints the number already held', async () => {
    contract.findUnique.mockResolvedValue(provisional);
    const result = await fillAgreementNumberFromBill('c1', '10699560129108');
    expect(result.applied).toBe(false);
    expect(contract.update).not.toHaveBeenCalled();
  });

  it('is a no-op the second time, so reaching it twice is safe', async () => {
    contract.findUnique.mockResolvedValueOnce(provisional).mockResolvedValueOnce(settled);
    expect((await fillAgreementNumberFromBill('c1', 'SR/TPJ/Civil/2025/0067')).applied).toBe(true);
    expect((await fillAgreementNumberFromBill('c1', 'SR/TPJ/Civil/2025/0067')).applied).toBe(false);
    expect(contract.update).toHaveBeenCalledTimes(1);
  });
});
