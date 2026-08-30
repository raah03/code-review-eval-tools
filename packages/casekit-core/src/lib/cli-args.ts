import { InvalidArgumentError } from "commander";

/** commander catches InvalidArgumentError to name the offending option in its own message */
function int(value: string, predicate: (n: number) => boolean, expectation: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || !predicate(parsed)) {
    throw new InvalidArgumentError(`expected ${expectation}, got "${value}"`);
  }
  return parsed;
}

export function positiveInt(value: string): number {
  return int(value, (n) => n > 0, "a positive integer");
}

export function nonNegativeInt(value: string): number {
  return int(value, (n) => n >= 0, "a non-negative integer");
}

export function ratio(value: string): number {
  const parsed = Number.parseFloat(value);
  if (!(parsed >= 0 && parsed <= 1)) {
    throw new InvalidArgumentError(`expected a ratio in [0,1], got "${value}"`);
  }
  return parsed;
}

export function float(value: string): number {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) {
    throw new InvalidArgumentError(`expected a number, got "${value}"`);
  }
  return parsed;
}
