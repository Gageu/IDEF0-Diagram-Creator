import { describe, expect, it } from 'vitest';
import type { DiagramGeometry } from '../src/geometry/geometry';
import { renderSvg } from '../src/render/svgRenderer';
import { referenceTheme } from '../src/theme/theme';

function geometry(overrides: Partial<DiagramGeometry>): DiagramGeometry {
  return {
    size: { width: 400, height: 300 },
    frame: { x: 20, y: 20, width: 360, height: 200 },
    footer: { node: 'A0', title: 'Title', number: 'X-01' },
    boxes: [],
    arrows: [],
    texts: [],
    leaders: [],
    defects: [],
    ...overrides,
  };
}

describe('renderSvg', () => {
  it('draws arrows as in the reference renderer: arc bends, line stopping at a separate arrowhead', () => {
    const svg = renderSvg(geometry({ arrows: [{ arrowId: 'a', head: true, points: [{ x: 200, y: 20 }, { x: 200, y: 180 }, { x: 450, y: 180 }, { x: 450, y: 240 }] }] }), referenceTheme);
    // Same path and triangle idef0.py writes for the A-0 diagram's C1 arrow.
    expect(svg).toContain('<path d="M200,20 L200,172 A8,8 0 0 0 208,180 L442,180 A8,8 0 0 1 450,188 L450,230" fill="none" stroke="#000" stroke-width="1.3"/>');
    expect(svg).toContain('<polygon points="450,240 445.5,230 454.5,230" fill="#000"/>');
  });

  it('shrinks a bend that would not fit its segments and rejects diagonals', () => {
    const svg = renderSvg(geometry({ arrows: [{ arrowId: 'a', head: false, points: [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 50 }] }] }), referenceTheme);
    expect(svg).toContain('A3,3 0 0 1 6,3');
    expect(() => renderSvg(geometry({ arrows: [{ arrowId: 'a', head: true, points: [{ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 9, y: 5 }] }] }), referenceTheme)).toThrow(/diagonal/);
  });

  it('draws a square box with a centred bold label and its number in the corner', () => {
    const svg = renderSvg(geometry({ boxes: [{ id: 'f', rect: { x: 420, y: 240, width: 260, height: 140 }, labelLines: ['Manage Requirement', 'Change Requests'], number: 'A0' }] }), referenceTheme);
    expect(svg).toContain('<rect x="420" y="240" width="260" height="140" fill="#fff" stroke="#000" stroke-width="1.6"/>');
    expect(svg).toContain('x="550" y="307"');
    expect(svg).toContain('x="550" y="323"');
    expect(svg).toContain('x="675" y="375" font-family="Liberation Sans, Arial, Helvetica, sans-serif" font-size="11" text-anchor="end" font-weight="bold" fill="#000">A0</text>');
    expect(svg).not.toMatch(/\brx=/);
  });

  it('draws a leader as a thin zigzag from the label to the arrow', () => {
    const svg = renderSvg(geometry({ leaders: [{ from: { x: 100, y: 100 }, to: { x: 200, y: 100 } }] }), referenceTheme);
    expect(svg).toContain('<path d="M100,100 L140,104 L160,96 L200,100" fill="none" stroke="#000" stroke-width="0.8"/>');
  });

  it('draws the NODE / TITLE / NUMBER footer below the frame and escapes text', () => {
    const svg = renderSvg(geometry({ footer: { node: 'A-0', title: 'Checklists & <Templates>', number: 'CC-01' } }), referenceTheme);
    expect(svg).toContain('<rect x="20" y="220" width="360" height="44"');
    expect(svg).toContain('>NODE:</text>');
    expect(svg).toContain('>Checklists &amp; &lt;Templates&gt;</text>');
    expect(svg).toContain('<line x1="190" y1="220" x2="190" y2="264"');
    expect(svg).toContain('<line x1="180" y1="220" x2="180" y2="264"');
  });
});
