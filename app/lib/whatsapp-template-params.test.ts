import { describe, expect, it } from 'vitest';
import { safeTemplateParam } from './whatsapp-mydreams';

/**
 * The provider takes a template's values as one comma-joined string and splits them
 * back apart on commas, so a comma inside a value silently becomes an extra parameter
 * and the send is refused. The approved 'bill_created_with_pdf' template takes exactly
 * five; six is not a message with a stray comma in it, it is no message.
 */
describe('safeTemplateParam', () => {
  it('leaves an ordinary value alone', () => {
    expect(safeTemplateParam('Rajesh Kumar')).toBe('Rajesh Kumar');
    expect(safeTemplateParam('SR/MDU/Civil/2024/0012')).toBe('SR/MDU/Civil/2024/0012');
  });

  it('turns a comma in a contractor name into a space, keeping it readable', () => {
    expect(safeTemplateParam('M/s ABC Constructions, Madurai')).toBe('M/s ABC Constructions Madurai');
  });

  it('keeps a five-value template at five values', () => {
    const values = ['M/s ABC Constructions, Madurai', 'B/1', 'SR/MDU/Civil/2024/0012', '31-Oct-2024', 'Rs 500000.00'];
    const wire = values.map(safeTemplateParam).join(',');
    expect(wire.split(',')).toHaveLength(5);
  });

  it('flattens newlines and tabs, which break the same way', () => {
    expect(safeTemplateParam('Line one\nLine two\tend')).toBe('Line one Line two end');
  });

  it('collapses the run of spaces a stripped comma can leave behind', () => {
    expect(safeTemplateParam('A ,  B')).toBe('A B');
  });

  it('handles null and undefined as empty, not as the words', () => {
    expect(safeTemplateParam(null)).toBe('');
    expect(safeTemplateParam(undefined)).toBe('');
  });

  it('caps a runaway value rather than sending an unbounded URL', () => {
    expect(safeTemplateParam('x'.repeat(400))).toHaveLength(250);
  });
});
