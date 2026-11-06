import { compile, parse } from 'mathjs';

const CONSTANTS = ['pi', 'e', 'PI', 'E', 'tau', 'phi'];
// A point unlikely to hit a domain edge, for the up-front test evaluation.
const TEST_POINT = [0.123, 0.456, 0.789];

/**
 * Compiles a user expression like "sin(x) * cos(y)" into a fast function of the
 * given variables, taken positionally: compileFunction('x^2 + y')(3, 1) === 10.
 * With `variables = []` the expression is a constant, e.g. "pi/2", and the
 * result is a function of no arguments.
 * Throws an Error with a readable message if the expression is invalid or
 * references other variables. Non-number results (e.g. complex) become NaN.
 */
export function compileFunction(source, variables = ['x', 'y']) {
  const names = variables.join(' and ');
  const text = source.trim();
  if (!text) throw new Error(variables.length ? `Enter an expression in ${names}.` : 'Enter a number.');

  let node;
  try {
    node = parse(text);
  } catch (err) {
    throw new Error(`Syntax error: ${err.message}`);
  }

  const allowed = new Set([...variables, ...CONSTANTS]);
  const unknown = new Set();
  node.traverse((n, path, parent) => {
    // Function names (the "sin" in sin(x)) are SymbolNodes too; skip them.
    if (n.isSymbolNode && !(parent?.isFunctionNode && path === 'fn') && !allowed.has(n.name)) {
      unknown.add(n.name);
    }
  });
  if (unknown.size) {
    const hint = variables.length ? `Use ${names}.` : 'Only constants like pi and e are allowed here.';
    throw new Error(`Unknown variable${unknown.size > 1 ? 's' : ''}: ${[...unknown].join(', ')}. ${hint}`);
  }

  const code = compile(text);
  const scope = Object.fromEntries(variables.map((v) => [v, 0]));
  const f = (...args) => {
    for (let i = 0; i < variables.length; i++) scope[variables[i]] = args[i];
    const value = code.evaluate(scope);
    return typeof value === 'number' ? value : NaN;
  };

  // Catch errors like unknown functions or wrong arity up front.
  try {
    f(...TEST_POINT);
  } catch (err) {
    throw new Error(err.message);
  }
  return f;
}

/**
 * TeX for a user expression, e.g. "x^2 - 1" → "{ x}^{2}-1", for typesetting with
 * KaTeX. Input that doesn't parse is shown verbatim in typewriter type.
 */
export function expressionToTex(source) {
  try {
    // math.js writes implicit multiplication as "~" (a TeX space); a thin space reads better.
    return parse(source).toTex({ implicit: 'hide' }).replaceAll('~', '\\,');
  } catch {
    const escaped = source.replace(/[\\{}$&#^_%~]/g, (c) => `\\char${c.charCodeAt(0)}`);
    return `\\texttt{${escaped}}`;
  }
}

/** Evaluates a constant expression such as "pi/2"; errors are prefixed with `name`. */
export function constant(source, name) {
  try {
    return compileFunction(source, [])();
  } catch (err) {
    throw new Error(`${name}: ${err.message}`);
  }
}
