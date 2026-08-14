import {
  combineSharedDisplayName,
  generateFantasySurname,
  splitSharedDisplayName,
} from '../fantasyNameGenerator';

describe('fantasyNameGenerator', () => {
  it('selects the surname prefix and suffix independently', () => {
    const firstSuffix = jest.fn<number, []>().mockReturnValue(0);
    const lastSuffix = jest
      .fn<number, []>()
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.999);

    const firstResult = generateFantasySurname(firstSuffix);
    const lastResult = generateFantasySurname(lastSuffix);

    expect(firstResult).toBe('Willowbrook');
    expect(lastResult).toMatch(/^Willow/);
    expect(lastResult).not.toBe(firstResult);
    expect(firstSuffix).toHaveBeenCalledTimes(2);
    expect(lastSuffix).toHaveBeenCalledTimes(2);
  });

  it('does not repeat the same word as both surname parts', () => {
    const random = jest
      .fn<number, []>()
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.42);

    expect(generateFantasySurname(random)).toBe('Willowmeadow');
  });

  it('combines trimmed name parts', () => {
    expect(combineSharedDisplayName(' Penny ', ' Greycloak ')).toBe(
      'Penny Greycloak',
    );
  });

  it('splits the persisted public display name for editing', () => {
    expect(splitSharedDisplayName('Penny Grey Cloak')).toEqual({
      firstName: 'Penny',
      fantasySurname: 'Grey Cloak',
    });
  });
});
