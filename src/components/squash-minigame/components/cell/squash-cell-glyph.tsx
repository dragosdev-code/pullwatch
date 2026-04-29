import { forwardRef } from 'react';

export interface SquashCellGlyphProps {
  glyphText: string;
}

/**
 * Label inside the grid cell button (`BUG` / `FEAT`). Ref target for glyph-only tap feedback scale.
 */
export const SquashCellGlyph = forwardRef<HTMLSpanElement, SquashCellGlyphProps>(
  function SquashCellGlyph({ glyphText }, ref) {
    return (
      <span ref={ref} aria-hidden className="inline-flex items-center justify-center">
        {glyphText}
      </span>
    );
  }
);
