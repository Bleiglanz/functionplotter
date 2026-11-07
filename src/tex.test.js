import { describe, expect, it } from 'vitest';
import { tex, texNum, texSigned, texText } from './tex.js';
import { expressionToTex, derivativeToTex } from './expression.js';

describe('texNum', () => {
  it('formats like formatNumber, with TeX exponents', () => {
    expect(texNum(0)).toBe('0');
    expect(texNum(-0.41615)).toBe('-0.4162');
    expect(texNum(1.5e-12)).toBe('1.500\\cdot 10^{-12}');
    expect(texNum(2.5e7)).toBe('2.500\\cdot 10^{7}');
    expect(texNum(NaN)).toBe('\\text{undefined}');
    expect(texSigned(-2)).toBe('- 2');
    expect(texSigned(3)).toBe('+ 3');
  });
});

describe('expressionToTex', () => {
  it('converts the presets', () => {
    expect(expressionToTex('x^2 - 1')).toBe('{ x}^{2}-1');
    expect(expressionToTex('1/x')).toBe('\\frac{1}{ x}');
    expect(expressionToTex('2pi')).toBe('2\\,\\pi');
    expect(expressionToTex('x < 1 ? 0.5 : 2')).toContain('\\begin{cases}');
  });

  it('falls back to typewriter text for input that does not parse', () => {
    expect(expressionToTex('sin(x')).toBe('\\texttt{sin(x}');
    expect(expressionToTex('a^{')).toBe('\\texttt{a\\char94\\char123}');
  });

  it('always yields TeX that KaTeX accepts', () => {
    for (const src of ['x^2 - 1', 'cos(x)', 'x == 0 ? 1 : sin(x)/x', 'e^(-x^2)', 'abs(x)', 'sin(x', 'a^{', '3(1-x)^2 exp(-x^2-(y+1)^2)']) {
      expect(tex(expressionToTex(src))).not.toContain('katex-error');
    }
  });
});

describe('tex', () => {
  it('renders, and reports bad TeX inline instead of throwing', () => {
    expect(tex('\\frac{1}{2}')).toContain('class="katex"');
    expect(tex('\\frac{1}{')).toContain('katex-error');
  });
});

describe('texText', () => {
  it('typesets only the \\( … \\) spans', () => {
    const html = texText('Area <b>under</b> \\(f\\) is \\(\\int_a^b f\\).');
    expect(html.startsWith('Area <b>under</b> <span class="katex">')).toBe(true);
    expect(html.match(/class="katex"/g)).toHaveLength(2);
    expect(html.endsWith('</span>.</span>')).toBe(true); // the period is kept with the formula
    expect(html).toContain('<span class="tex-nowrap">');
  });
});

describe('derivativeToTex', () => {
  it('differentiates formulas symbolically', () => {
    expect(derivativeToTex('x^2')).toBe('2\\cdot x');
    expect(derivativeToTex('sin(x)')).toBe('\\cos\\left( x\\right)');
    expect(tex(derivativeToTex('x^3 - 3x'))).not.toContain('katex-error');
  });

  it('gives null where math.js cannot differentiate', () => {
    expect(derivativeToTex('x == 0 ? 0 : x*sin(1/x)')).toBeNull();
    expect(derivativeToTex('sin(x')).toBeNull();
  });
});
