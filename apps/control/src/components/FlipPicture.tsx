import type { FlipAxis } from '@lowrider/cam';

/**
 * A small picture of how the part is turned over, seen from above: the
 * board, the line it turns over (dashed) and an arrow from the edge that
 * moves to where it goes. `x` turns like the page of a book, `y` over the
 * front edge. Purely an illustration: the text beside it says the same.
 */
export function FlipPicture({ axis }: { axis: FlipAxis }) {
  const page = axis === 'x';
  return (
    <svg
      className="flip-picture"
      viewBox="0 0 120 84"
      width="120"
      height="84"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <marker
          id={`flip-arrow-${axis}`}
          viewBox="0 0 10 10"
          refX="7"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M0 0 10 5 0 10z" fill="currentColor" />
        </marker>
      </defs>
      {/* The board, the half that moves a little lighter */}
      <rect x="20" y="26" width="80" height="44" rx="3" className="flip-board" />
      {page ? (
        <rect x="20" y="26" width="40" height="44" rx="3" className="flip-half" />
      ) : (
        <rect x="20" y="48" width="80" height="22" rx="3" className="flip-half" />
      )}
      {/* The flip line */}
      {page ? (
        <line x1="60" y1="16" x2="60" y2="80" className="flip-line" />
      ) : (
        <line x1="8" y1="48" x2="112" y2="48" className="flip-line" />
      )}
      {/* The edge that moves, and where it goes */}
      {page ? (
        <path
          d="M26 20 Q60 -6 94 20"
          className="flip-turn"
          markerEnd={`url(#flip-arrow-${axis})`}
        />
      ) : (
        <path
          d="M106 66 Q124 48 106 30"
          className="flip-turn"
          markerEnd={`url(#flip-arrow-${axis})`}
        />
      )}
      {/* The two registration holes */}
      {page ? (
        <>
          <circle cx="11" cy="48" r="3" className="flip-hole" />
          <circle cx="109" cy="48" r="3" className="flip-hole" />
        </>
      ) : (
        <>
          <circle cx="60" cy="79" r="3" className="flip-hole" />
          <circle cx="60" cy="17" r="3" className="flip-hole" />
        </>
      )}
    </svg>
  );
}
