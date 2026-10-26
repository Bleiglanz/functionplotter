import { compile, parse } from 'mathjs';

const ALLOWED_VARIABLES = new Set(['x', 'y', 'pi', 'e', 'PI', 'E', 'tau', 'phi']);

/**
 * Compiles a user expression like "sin(x) * cos(y)" into a fast (x, y) => number.
 * Throws an Error with a readable message if the expression is invalid or
 * references variables other than x and y.
 */
export function compileFunction(source) {
  const text = source.trim();
  if (!text) throw new Error('Enter an expression in x and y.');

  let node;
  try {
    node = parse(text);
  } catch (err) {
    throw new Error(`Syntax error: ${err.message}`);
  }

  const unknown = new Set();
  node.traverse((n, path, parent) => {
    // Function names (the "sin" in sin(x)) are SymbolNodes too; skip them.
    if (n.isSymbolNode && !(parent?.isFunctionNode && path === 'fn') && !ALLOWED_VARIABLES.has(n.name)) {
      unknown.add(n.name);
    }
  });
  if (unknown.size) {
    throw new Error(`Unknown variable${unknown.size > 1 ? 's' : ''}: ${[...unknown].join(', ')}. Use x and y.`);
  }

  const code = compile(text);
  const scope = { x: 0, y: 0 };
  const f = (x, y) => {
    scope.x = x;
    scope.y = y;
    const value = code.evaluate(scope);
    return typeof value === 'number' ? value : NaN;
  };

  // Catch errors like unknown functions or wrong arity up front, at a point
  // unlikely to hit a domain edge.
  try {
    f(0.123, 0.456);
  } catch (err) {
    throw new Error(err.message);
  }
  return f;
}
