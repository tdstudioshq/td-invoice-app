declare module "bun:test" {
  export function describe(name: string, callback: () => void): void;
  export function test(name: string, callback: () => void): void;
  export function expect<T>(value: T): {
    toBe(expected: unknown): void;
    toHaveLength(expected: number): void;
    toEqual(expected: unknown): void;
  };
}
